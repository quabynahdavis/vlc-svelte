//! Container duration for library cards, probed by ffmpeg and cached in SQLite.
//!
//! Scan results do not carry duration: walking a tree must stay cheap. A
//! detached webview `<video>` also cannot read metadata for most scanned
//! items (`asset://` has no CORS header; many containers are not webview-
//! decodable). Duration is therefore taken from ffmpeg's container probe
//! (`ffmpeg -i`, no decode) and stored in the `durations` table keyed by
//! absolute path, mirroring thumbnails/covers/waveforms.
//!
//! `media_duration` is cache-then-probe in one IPC roundtrip. `Ok(None)`
//! covers missing files, missing ffmpeg, unreadable containers and a zero
//! / N/A duration — the front-end then keeps the HTML fallback for whatever
//! the webview can decode.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::db::Database;
use crate::thumb::FFMPEG_PATH;

/// Kill a hung probe instead of blocking a command thread.
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(8);
const FFMPEG_POLL: Duration = Duration::from_millis(40);
/// stderr of `ffmpeg -i` is a short banner; cap so a runaway cannot fill RAM.
const MAX_STDERR_BYTES: usize = 64_000;

fn unix_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn load_duration(conn: &Connection, path: &str) -> rusqlite::Result<Option<f64>> {
    conn.query_row(
        "SELECT seconds FROM durations WHERE path = ?1",
        params![path],
        |row| row.get(0),
    )
    .optional()
}

fn store_duration(
    conn: &Connection,
    path: &str,
    seconds: f64,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO durations (path, seconds, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET
             seconds = excluded.seconds,
             updated_at = excluded.updated_at",
        params![path, seconds, now_ms],
    )
}

/// Parse `Duration: HH:MM:SS.xx` from ffmpeg's informational banner.
pub(crate) fn parse_ffmpeg_duration(stderr: &str) -> Option<f64> {
    let marker = "Duration: ";
    let start = stderr.find(marker)? + marker.len();
    let token = stderr[start..].split([',', '\n']).next()?.trim();
    if token.is_empty() || token.eq_ignore_ascii_case("N/A") {
        return None;
    }

    let mut parts = token.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }

    let total = hours * 3600.0 + minutes * 60.0 + seconds;
    (total.is_finite() && total > 0.0).then_some(total)
}

fn spawn_stderr_reader(
    mut stderr: impl Read + Send + 'static,
    copied: Arc<AtomicUsize>,
) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            match stderr.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    buffer.extend_from_slice(&chunk[..n]);
                    copied.store(buffer.len(), Ordering::Relaxed);
                    if buffer.len() >= MAX_STDERR_BYTES {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        buffer
    })
}

/// `ffmpeg -i` prints the container banner on stderr and exits non-zero
/// because no output is specified. That is the cheap probe: no decode.
fn run_ffmpeg_duration(ffmpeg: &str, path: &str) -> Option<f64> {
    let started = SystemTime::now();

    let mut child = Command::new(ffmpeg)
        .args(["-nostdin", "-hide_banner", "-i", path])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;

    let stderr = child.stderr.take()?;
    let copied = Arc::new(AtomicUsize::new(0));
    let reader = spawn_stderr_reader(stderr, Arc::clone(&copied));

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let bytes = reader.join().unwrap_or_default();
                let text = String::from_utf8_lossy(&bytes);
                return parse_ffmpeg_duration(&text);
            }
            Ok(None) => {
                if copied.load(Ordering::Relaxed) >= MAX_STDERR_BYTES {
                    let _ = child.kill();
                    let _ = child.wait();
                    let bytes = reader.join().unwrap_or_default();
                    let text = String::from_utf8_lossy(&bytes);
                    return parse_ffmpeg_duration(&text);
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

/// Cached duration, or a fresh ffmpeg probe persisted for the next visit.
#[tauri::command(async)]
pub fn media_duration(state: State<'_, Database>, path: String) -> Result<Option<f64>, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_absolute() || !file_path.is_file() {
        return Ok(None);
    }

    {
        let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
        if let Some(seconds) = load_duration(&conn, &path).map_err(|e| e.to_string())? {
            if seconds.is_finite() && seconds > 0.0 {
                return Ok(Some(seconds));
            }
        }
    }

    if !Path::new(FFMPEG_PATH).is_file() {
        return Ok(None);
    }

    let Some(seconds) = run_ffmpeg_duration(FFMPEG_PATH, &path) else {
        return Ok(None);
    };

    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    store_duration(&conn, &path, seconds, unix_time_ms()).map_err(|e| e.to_string())?;
    Ok(Some(seconds))
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
    fn test_parse_ffmpeg_duration_banner() {
        let stderr = "Input #0, matroska,webm, from 'clip.mkv':\n  Duration: 01:02:03.50, start: 0.000000, bitrate: 1500 kb/s\n";
        assert_eq!(parse_ffmpeg_duration(stderr), Some(3723.5));
    }

    #[test]
    fn test_parse_ffmpeg_duration_short() {
        assert_eq!(
            parse_ffmpeg_duration("  Duration: 00:03:32.50, start: 0.0\n"),
            Some(212.5)
        );
    }

    #[test]
    fn test_parse_ffmpeg_duration_na_and_zero() {
        assert_eq!(parse_ffmpeg_duration("  Duration: N/A, start: 0.0\n"), None);
        assert_eq!(
            parse_ffmpeg_duration("  Duration: 00:00:00.00, start: 0.0\n"),
            None
        );
        assert_eq!(parse_ffmpeg_duration("no duration here"), None);
    }

    #[test]
    fn test_duration_roundtrip_and_overwrite() {
        let conn = test_conn();
        assert_eq!(load_duration(&conn, "/videos/a.mkv").unwrap(), None);

        store_duration(&conn, "/videos/a.mkv", 212.5, 1_000).unwrap();
        assert_eq!(load_duration(&conn, "/videos/a.mkv").unwrap(), Some(212.5));

        store_duration(&conn, "/videos/a.mkv", 90.0, 2_000).unwrap();
        assert_eq!(load_duration(&conn, "/videos/a.mkv").unwrap(), Some(90.0));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM durations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
