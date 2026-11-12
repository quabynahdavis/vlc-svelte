//! Waveform peak data for the music seekbar, decoded by ffmpeg and persisted
//! in SQLite.
//!
//! The webview <audio>/<video> element has no Web Audio API access to an
//! `asset://` source's samples, so peak extraction happens Rust-side: one
//! synchronous ffmpeg run per track resamples the file to mono 8 kHz raw
//! PCM on stdout, which is reduced to `buckets` peak amplitudes in 0..1.
//! Peaks are stored as little-endian f32 blobs in the `waveforms` table
//! (`db::init_schema`), keyed by the media item's absolute file path — the
//! same keying scheme as `thumbnails` and `covers`, in its own table so the
//! three blob domains never share a primary-key namespace.
//!
//! `waveform_generate` is the whole pipeline in a single IPC roundtrip:
//! cached-hit or compute → persist → return. `waveform_get` reads an
//! existing row, and `waveform_peaks` computes without touching the cache
//! (the webview's resolve chain: cache → get → generate). All three return
//! `None` (not `Err`) when no peaks can be produced — non-audio container,
//! missing file, missing ffmpeg, empty decode output — so the front-end
//! falls back to its plain progress bar, exactly like `thumb_generate`'s
//! contract with the webview capture pipeline.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::db::Database;
use crate::library::is_audio_path;
use crate::thumb::{spawn_stdout_reader, FFMPEG_PATH};

/// Requested resolution when the caller does not care: 800 buckets resolve
/// to one peak every ~7 ms of audio and still draw fine on a wide seekbar.
const DEFAULT_BUCKETS: u32 = 800;
/// Buckets below this stop resolving to distinguishable bars; above it the
/// blob grows for no visible benefit on any plausible canvas width.
const MIN_BUCKETS: u32 = 50;
const MAX_BUCKETS: u32 = 2000;

/// Decode target: mono 8 kHz s16le keeps a full track's raw samples small
/// (16 KB/s of audio) while still capturing every peak a seekbar shows.
const SAMPLE_RATE: u32 = 8000;
const CHANNELS: u32 = 1;

/// Hard cap for one decode (~100 minutes at 16 KB/s). The reader stops at
/// the cap and the run is discarded rather than blocking a command thread.
const MAX_OUTPUT_BYTES: usize = 96_000_000;

/// Kill long-running decodes instead of blocking a command thread. Peak
/// extraction must decode the whole file, so this is deliberately more
/// generous than the 10 s frame-extraction timeout in `thumb.rs`.
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(60);
/// Poll granularity for the timeout watch.
const FFMPEG_POLL: Duration = Duration::from_millis(40);

/// Clamp a requested bucket count into the sane range; `0` means "default".
pub(crate) fn clamp_bucket_count(buckets: u32) -> u32 {
    if buckets == 0 {
        return DEFAULT_BUCKETS;
    }
    buckets.clamp(MIN_BUCKETS, MAX_BUCKETS)
}

/// Reduce mono PCM samples to `buckets` peak amplitudes in 0..1.
///
/// Every bucket covers the same number of samples (`len / buckets`, rounded
/// up); the last buckets are zero-filled when the track is shorter than the
/// requested resolution. The peak is the maximum |sample| of the bucket —
/// not the average — so transients survive, normalized by 32768 (full s16
/// scale). Silence decodes to all-zero peaks; an empty input still yields a
/// full-length (silent) result so callers can rely on the bucket count.
pub fn peaks_from_samples(samples: &[i16], buckets: u32) -> Vec<f32> {
    // Pure reduce: the bucket count is taken as given (0 guarded to 1 so the
    // chunk math never divides by zero); range clamping is the command
    // boundary's job (`clamp_bucket_count`).
    let buckets = buckets.max(1) as usize;
    let chunk = samples.len().div_ceil(buckets).max(1);

    let mut peaks = Vec::with_capacity(buckets);
    for index in 0..buckets {
        let start = index * chunk;
        if start >= samples.len() {
            peaks.push(0.0);
            continue;
        }
        let end = (start + chunk).min(samples.len());
        let peak = samples[start..end]
            .iter()
            .fold(0i32, |max, &sample| max.max((sample as i32).abs()));
        peaks.push((peak.min(32768) as f32 / 32768.0).min(1.0));
    }
    peaks
}

/// Decode raw little-endian s16le bytes into samples; a trailing odd byte
/// (a truncated pipe write) is dropped rather than misparsed.
pub(crate) fn pcm_bytes_to_samples(bytes: &[u8]) -> Vec<i16> {
    bytes
        .chunks_exact(2)
        .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
        .collect()
}

/// Encode peaks as a little-endian f32 blob for the `waveforms` table.
pub(crate) fn peaks_to_blob(peaks: &[f32]) -> Vec<u8> {
    let mut blob = Vec::with_capacity(peaks.len() * 4);
    for &peak in peaks {
        blob.extend_from_slice(&peak.to_le_bytes());
    }
    blob
}

/// Decode a stored blob back into peaks; `None` for truncated/corrupt rows.
pub(crate) fn blob_to_peaks(bytes: &[u8]) -> Option<Vec<f32>> {
    if bytes.len() % 4 != 0 {
        return None;
    }
    Some(
        bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect(),
    )
}

/// Shared gate for every command: peaks only make sense for an absolute
/// path to a readable file with a known audio extension.
fn waveform_request_allowed(path: &str) -> bool {
    let file_path = PathBuf::from(path);
    file_path.is_absolute() && is_audio_path(&file_path) && file_path.is_file()
}

/// Store (or overwrite) the peaks for `path` at the requested resolution.
fn store_waveform(
    conn: &Connection,
    path: &str,
    peaks: &[f32],
    buckets: u32,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO waveforms (path, peaks, buckets, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET
             peaks = excluded.peaks,
             buckets = excluded.buckets,
             updated_at = excluded.updated_at",
        params![path, peaks_to_blob(peaks), buckets, now_ms],
    )
}

/// Read the peaks stored for `path` with their bucket count, if any.
/// Corrupt blobs resolve to `None` so the caller regenerates instead of
/// drawing garbage.
fn load_waveform(conn: &Connection, path: &str) -> rusqlite::Result<Option<(Vec<f32>, u32)>> {
    conn.query_row(
        "SELECT peaks, buckets FROM waveforms WHERE path = ?1",
        params![path],
        |row| {
            let blob: Vec<u8> = row.get(0)?;
            let buckets: u32 = row.get(1)?;
            Ok(blob_to_peaks(&blob).map(|peaks| (peaks, buckets)))
        },
    )
    .optional()
    .map(|stored| stored.flatten())
}

fn unix_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Run the decode command, guarding against hangs and oversized output.
///
/// Mirrors `thumb.rs`'s extraction loop: ffmpeg writes raw PCM to stdout
/// while a reader thread drains the pipe into a capped buffer (draining is
/// what keeps the child from deadlocking on a full pipe), and the command
/// thread watches with `try_wait` so it can kill anything that overstays
/// `FFMPEG_TIMEOUT`.
fn run_ffmpeg_pcm(ffmpeg: &str, path: &str) -> Option<Vec<u8>> {
    let started = SystemTime::now();

    let mut child = Command::new(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            path,
            "-ac",
            CHANNELS.to_string().as_str(),
            "-ar",
            SAMPLE_RATE.to_string().as_str(),
            "-f",
            "s16le",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let stdout = child.stdout.take()?;
    let copied = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let reader = spawn_stdout_reader(stdout, Arc::clone(&copied));

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let bytes = reader.join().unwrap_or_default();
                if !status.success() || bytes.is_empty() || bytes.len() >= MAX_OUTPUT_BYTES {
                    return None;
                }
                return Some(bytes);
            }
            Ok(None) => {
                if copied.load(Ordering::Relaxed) >= MAX_OUTPUT_BYTES {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                if started.elapsed().unwrap_or_default() >= FFMPEG_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(FFMPEG_POLL);
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

/// Decode `path` and reduce it to `buckets` peaks; `None` (logged warn) when
/// ffmpeg is missing, the decode fails, or the output is empty.
fn compute_peaks(ffmpeg: &str, path: &str, buckets: u32) -> Option<Vec<f32>> {
    let bytes = run_ffmpeg_pcm(ffmpeg, path)?;
    if bytes.is_empty() {
        eprintln!("waveform: empty decode output for {}", path);
        return None;
    }
    let samples = pcm_bytes_to_samples(&bytes);
    if samples.is_empty() {
        eprintln!("waveform: no decodable samples for {}", path);
        return None;
    }
    Some(peaks_from_samples(&samples, clamp_bucket_count(buckets)))
}

/// Compute the peaks of one audio file without touching the persistence
/// cache. `None` for anything the desktop pipeline cannot serve.
#[tauri::command(async)]
pub fn waveform_peaks(_state: State<'_, Database>, path: String, buckets: u32) -> Result<Option<Vec<f32>>, String> {
    if !waveform_request_allowed(&path) {
        return Ok(None);
    }
    if !Path::new(FFMPEG_PATH).is_file() {
        return Ok(None);
    }
    Ok(compute_peaks(FFMPEG_PATH, &path, clamp_bucket_count(buckets)))
}

/// Read a previously persisted waveform, `None` when one was never stored.
#[tauri::command(async)]
pub fn waveform_get(state: State<'_, Database>, path: String) -> Result<Option<Vec<f32>>, String> {
    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    load_waveform(&conn, &path)
        .map(|stored| stored.map(|(peaks, _)| peaks))
        .map_err(|e| e.to_string())
}

/// Produce the peaks of one audio file and persist them, in a single IPC
/// roundtrip.
///
/// A cached row at the requested resolution is returned as-is (decoding a
/// whole track is far more expensive than the read). Otherwise the peaks are
/// computed, stored, and returned; `None` when nothing could be produced —
/// the front-end then keeps its plain progress bar.
#[tauri::command(async)]
pub fn waveform_generate(
    state: State<'_, Database>,
    path: String,
    buckets: u32,
) -> Result<Option<Vec<f32>>, String> {
    let buckets = clamp_bucket_count(buckets);

    if !waveform_request_allowed(&path) {
        return Ok(None);
    }

    // Cache hit at the same resolution: no decode needed.
    {
        let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
        if let Some((peaks, stored_buckets)) = load_waveform(&conn, &path).map_err(|e| e.to_string())? {
            if stored_buckets == buckets {
                return Ok(Some(peaks));
            }
        }
    }

    if !Path::new(FFMPEG_PATH).is_file() {
        return Ok(None);
    }

    let Some(peaks) = compute_peaks(FFMPEG_PATH, &path, buckets) else {
        return Ok(None);
    };

    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    store_waveform(&conn, &path, &peaks, buckets, unix_time_ms()).map_err(|e| e.to_string())?;
    Ok(Some(peaks))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_clamp_bucket_count() {
        assert_eq!(clamp_bucket_count(0), DEFAULT_BUCKETS);
        assert_eq!(clamp_bucket_count(1), MIN_BUCKETS);
        assert_eq!(clamp_bucket_count(49), MIN_BUCKETS);
        assert_eq!(clamp_bucket_count(800), 800);
        assert_eq!(clamp_bucket_count(2001), MAX_BUCKETS);
        assert_eq!(clamp_bucket_count(u32::MAX), MAX_BUCKETS);
    }

    /// Constant-amplitude audio must reduce to a flat waveform at full scale.
    #[test]
    fn test_peaks_constant_amplitude_is_flat() {
        let samples = vec![i16::MAX; 10_000];
        let peaks = peaks_from_samples(&samples, 10);
        assert_eq!(peaks.len(), 10);
        for peak in peaks {
            assert!((peak - 1.0).abs() < 0.001, "expected full-scale peak, got {peak}");
        }
    }

    /// Silence reduces to all-zero peaks, and so does an empty input (which
    /// still yields the full bucket count).
    #[test]
    fn test_peaks_silence_is_zero() {
        for buckets in [10u32, 800] {
            let peaks = peaks_from_samples(&vec![0i16; 5_000], buckets);
            assert_eq!(peaks.len(), buckets as usize);
            assert!(peaks.iter().all(|p| *p == 0.0));

            let empty = peaks_from_samples(&[], buckets);
            assert_eq!(empty.len(), buckets as usize);
            assert!(empty.iter().all(|p| *p == 0.0));
        }
    }

    /// The result always has exactly the clamped bucket count, whatever was
    /// requested.
    #[test]
    fn test_peaks_bucket_count_and_clamping() {
        let samples: Vec<i16> = (0..1000).map(|i| ((i % 100) * 300) as i16).collect();

        assert_eq!(peaks_from_samples(&samples, 5).len(), 5);
        // The pure reduce takes the count as given (0 is guarded to 1);
        // the command boundary turns 0 into the 800 default via
        // `clamp_bucket_count`, which `test_clamp_bucket_count` pins.
        assert_eq!(peaks_from_samples(&samples, 0).len(), 1);
        assert_eq!(peaks_from_samples(&samples, 99_999).len(), 99_999);
        // Track shorter than the requested resolution: zero-filled tail.
        // With 1000 samples over 800 buckets, each bucket covers 2 samples,
        // so buckets from index 500 onward have no samples at all.
        let peaks = peaks_from_samples(&samples, 800);
        assert_eq!(peaks.len(), 800);
        assert!(peaks[500..].iter().all(|p| *p == 0.0));
    }

    /// A single loud transient inside a quiet bucket dominates its peak —
    /// max, not average.
    #[test]
    fn test_peaks_transients_survive() {
        let mut samples = vec![1i16; 1_000];
        samples[500] = i16::MAX;
        let peaks = peaks_from_samples(&samples, 10);
        assert!((peaks[5] - 1.0).abs() < 0.001, "transient bucket is full scale");
        assert!(peaks[..5].iter().all(|p| *p < 0.001), "quiet buckets stay quiet");
    }

    /// i16::MIN normalizes to exactly full scale without overflowing (its
    /// |value| is not representable as i16).
    #[test]
    fn test_peaks_handle_negative_full_scale() {
        let peaks = peaks_from_samples(&[i16::MIN], 1);
        assert!((peaks[0] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_pcm_bytes_to_samples() {
        // 0x00 0x01 little-endian = 256; 0xFF 0xFF = -1.
        let samples = pcm_bytes_to_samples(&[0x00, 0x01, 0xFF, 0xFF]);
        assert_eq!(samples, vec![256, -1]);

        // A trailing odd byte (truncated pipe write) is dropped.
        assert_eq!(pcm_bytes_to_samples(&[0x01, 0x00, 0x7F]), vec![1]);
        assert!(pcm_bytes_to_samples(&[]).is_empty());
    }

    #[test]
    fn test_peaks_blob_roundtrip() {
        let peaks = vec![0.0, 0.25, 0.5, 1.0, 0.123_456];
        let restored = blob_to_peaks(&peaks_to_blob(&peaks)).unwrap();
        assert_eq!(restored.len(), peaks.len());
        for (original, decoded) in peaks.iter().zip(restored.iter()) {
            assert!((original - decoded).abs() < f32::EPSILON);
        }

        // Truncated blobs (corrupt row) resolve to None, not garbage.
        let blob = peaks_to_blob(&peaks);
        assert_eq!(blob_to_peaks(&blob[..blob.len() - 2]), None);
        assert_eq!(blob_to_peaks(&[]), Some(Vec::new()));
    }

    /// Persistence roundtrip mirrors the `thumbnails` tests: insert, read
    /// back, overwrite in place, independent keys, unknown path is None.
    #[test]
    fn test_waveform_store_load_roundtrip() {
        let conn = test_conn();
        assert_eq!(load_waveform(&conn, "/music/a.mp3").unwrap(), None);

        let peaks = vec![0.1, 0.9, 0.5];
        store_waveform(&conn, "/music/a.mp3", &peaks, 3, 1_000).unwrap();
        let (loaded, buckets) = load_waveform(&conn, "/music/a.mp3").unwrap().unwrap();
        assert_eq!(buckets, 3);
        assert_eq!(loaded.len(), peaks.len());
        for (original, decoded) in peaks.iter().zip(loaded.iter()) {
            assert!((original - decoded).abs() < f32::EPSILON);
        }

        // Storing again replaces the row without adding a second one.
        let other = vec![1.0];
        store_waveform(&conn, "/music/a.mp3", &other, 800, 2_000).unwrap();
        let (loaded, buckets) = load_waveform(&conn, "/music/a.mp3").unwrap().unwrap();
        assert_eq!(buckets, 800);
        assert_eq!(loaded.len(), 1);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM waveforms", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // Other paths stay untouched and independently keyed.
        store_waveform(&conn, "/music/b.flac", &peaks, 3, 3_000).unwrap();
        assert_eq!(
            load_waveform(&conn, "/music/b.flac").unwrap().map(|(_, b)| b),
            Some(3)
        );
        assert_eq!(
            load_waveform(&conn, "/music/a.mp3").unwrap().map(|(_, b)| b),
            Some(800)
        );
        assert_eq!(load_waveform(&conn, "/music/missing.mp3").unwrap(), None);
    }

    /// Corrupt persisted blobs resolve to None so `waveform_generate`
    /// regenerates instead of drawing garbage.
    #[test]
    fn test_load_waveform_rejects_corrupt_blob() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO waveforms (path, peaks, buckets, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params!["/music/c.mp3", vec![1u8, 2, 3], 800, 1],
        )
        .unwrap();
        assert_eq!(load_waveform(&conn, "/music/c.mp3").unwrap(), None);
    }

    /// Extension gating shared by every command: audio yes, video/no-extension
    /// no, relative paths no, missing files no.
    #[test]
    fn test_waveform_request_gating() {
        let real = std::env::temp_dir().join("kanea_waveform_gate_test.mp3");
        std::fs::write(&real, b"fake audio").unwrap();

        assert!(waveform_request_allowed(real.to_str().unwrap()));

        // Non-audio extension, even for a real file.
        let video = std::env::temp_dir().join("kanea_waveform_gate_test.mp4");
        std::fs::write(&video, b"fake video").unwrap();
        assert!(!waveform_request_allowed(video.to_str().unwrap()));

        // Relative path (even if it existed) is rejected.
        assert!(!waveform_request_allowed("relative/song.mp3"));
        // Non-existent audio path is rejected.
        assert!(!waveform_request_allowed(
            std::env::temp_dir().join("kanea_waveform_gate_missing.mp3").to_str().unwrap()
        ));
        // No extension at all.
        assert!(!waveform_request_allowed("/home/u/Music/track"));

        let _ = std::fs::remove_file(&real);
        let _ = std::fs::remove_file(&video);
    }
}
