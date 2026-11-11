//! Audio tags and embedded cover art, read with lofty and persisted in SQLite.
//!
//! Mirrors `thumb.rs`: `cover_extract` is the whole pipeline in a single IPC
//! roundtrip (read artwork → persist → return the bytes) and `cover_get`
//! reads a previously persisted blob. Both return `None` (not `Err`) when no
//! cover can be produced — non-audio container, missing file, no embedded
//! artwork, unparsable tag data — so the front-end falls back to its own
//! handling for whatever the desktop path cannot serve.
//!
//! `read_audio_metadata` parses tag text (title/artist/album/year/track/
//! disc/genre), the container duration, and whether artwork is embedded, all
//! without touching a decoder. Cover blobs live in the `covers` table
//! (`db::init_schema`), keyed by the media item's absolute file path — same
//! keying scheme as `thumbnails`, but a separate table so the two domains
//! (video frames vs. artwork) never share a primary-key namespace.
//!
//! Known lofty limitations, both surface as `None` + a warning log, never a
//! panic: `wma` (ASF) and `mka` (Matroska) containers are not parsable by
//! lofty, and some containers cannot carry a duration (e.g. raw ADTS AAC),
//! which is reported as a zero duration and mapped to `None` so the
//! front-end keeps probing durations on its own.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use lofty::file::TaggedFile;
use lofty::picture::Picture;
use lofty::prelude::*;
use lofty::tag::Tag;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Database;
use crate::library::is_audio_path;

/// Tag payload for one audio file, mirrored by the front-end `AudioMetadata`
/// interface (serde camelCase, matching every other IPC struct here).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub genre: Option<String>,
    pub duration_seconds: Option<f64>,
    pub has_cover: bool,
}

/// Read the tags/duration/cover-presence of one audio file.
///
/// `None` when the path is not an audio container, is not a readable file,
/// or the container is not one lofty can parse. Read failures are logged,
/// never panicking: tag data is user-written and routinely malformed.
#[tauri::command(async)]
pub fn read_audio_metadata(path: String) -> Option<AudioMetadata> {
    let file_path = PathBuf::from(&path);
    if !is_audio_path(&file_path) || !file_path.is_file() {
        return None;
    }
    metadata_from_path(&file_path)
}

/// Read a previously persisted cover, `None` when one was never stored.
#[tauri::command(async)]
pub fn cover_get(state: State<'_, Database>, path: String) -> Result<Option<Vec<u8>>, String> {
    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    load_cover(&conn, &path).map_err(|e| e.to_string())
}

/// Extract the embedded artwork of one audio file and persist it, in a single
/// IPC roundtrip.
///
/// Returns the image bytes, or `None` when none could be produced
/// (non-absolute path, non-audio container, missing file, no embedded
/// artwork, unparsable container) — the front-end then falls back to its own
/// artwork handling.
#[tauri::command(async)]
pub fn cover_extract(state: State<'_, Database>, path: String) -> Result<Option<Vec<u8>>, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_absolute() || !is_audio_path(&file_path) {
        return Ok(None);
    }
    if !file_path.is_file() {
        return Ok(None);
    }

    let Some(data) = read_cover_bytes(&file_path) else {
        return Ok(None);
    };

    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    store_cover(&conn, &path, &data, unix_time_ms()).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

/// Parse an audio file into `AudioMetadata`, `None` when lofty cannot read it.
fn metadata_from_path(path: &Path) -> Option<AudioMetadata> {
    match lofty::read_from_path(path) {
        Ok(file) => Some(metadata_from_file(&file)),
        Err(err) => {
            eprintln!("audio_meta: cannot read {}: {}", path.display(), err);
            None
        }
    }
}

/// Pull the embedded artwork bytes out of an audio file, `None` when there
/// is none or the container is unparsable.
fn read_cover_bytes(path: &Path) -> Option<Vec<u8>> {
    match lofty::read_from_path(path) {
        Ok(file) => best_picture(file.tags()).map(|picture| picture.data().to_vec()),
        Err(err) => {
            eprintln!("audio_meta: cannot read {}: {}", path.display(), err);
            None
        }
    }
}

/// Extract `AudioMetadata` from a parsed audio file.
///
/// Tag precedence: containers can carry more than one tag format at once (a
/// FLAC may still contain legacy ID3v2 frames, an MP3 may carry APE beside
/// ID3v2). `primary_tag` is lofty's notion of the *native* tag for the
/// container (Vorbis Comments for FLAC/Ogg/Opus, ID3v2 for MP3/AAC/WAV,
/// iTunes `ilst` for MP4/M4A), so it wins; `first_tag` is the fallback when
/// the file carries no primary tag at all.
fn metadata_from_file(file: &TaggedFile) -> AudioMetadata {
    let tag = file.primary_tag().or_else(|| file.first_tag());

    // Duration: zero means "unknown" (some containers cannot carry it, e.g.
    // raw ADTS AAC), which is reported as `None` so the front-end keeps
    // probing durations on its own.
    let duration = file.properties().duration();
    let duration_seconds = (!duration.is_zero()).then(|| duration.as_secs_f64());

    AudioMetadata {
        title: tag.and_then(|t| t.title()).map(|v| v.into_owned()),
        artist: tag.and_then(|t| t.artist()).map(|v| v.into_owned()),
        album_artist: tag
            .and_then(|t| t.get_string(ItemKey::AlbumArtist))
            .map(str::to_owned),
        album: tag.and_then(|t| t.album()).map(|v| v.into_owned()),
        year: tag.and_then(year_of),
        track_number: tag.and_then(|t| t.track()),
        disc_number: tag.and_then(|t| t.disk()),
        genre: tag.and_then(|t| t.genre()).map(|v| v.into_owned()),
        duration_seconds,
        has_cover: file.tags().iter().any(|t| !t.pictures().is_empty()),
    }
}

/// Release year of a tag's date item (`RecordingDate`/`Year` keys).
///
/// Both keys parse through lofty's relaxed `Timestamp`; a zero year (empty or
/// placeholder date tag) is no year.
fn year_of(tag: &Tag) -> Option<u32> {
    let year = u32::from(tag.date()?.year);
    (year != 0).then_some(year)
}

/// The embedded artwork to serve for a file: the largest picture across all
/// of its tags (front covers are typically the only or largest one; size
/// beats scan order).
fn best_picture(tags: &[Tag]) -> Option<&Picture> {
    tags.iter()
        .flat_map(|tag| tag.pictures())
        .max_by_key(|picture| picture.data().len())
}

/// Store (or overwrite) the cover bytes for `path`.
fn store_cover(
    conn: &Connection,
    path: &str,
    data: &[u8],
    now_ms: i64,
) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO covers (path, data, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET
             data = excluded.data,
             updated_at = excluded.updated_at",
        params![path, data, now_ms],
    )
}

/// Read the cover bytes stored for `path`, if any.
fn load_cover(conn: &Connection, path: &str) -> rusqlite::Result<Option<Vec<u8>>> {
    conn.query_row(
        "SELECT data FROM covers WHERE path = ?1",
        params![path],
        |row| row.get(0),
    )
    .optional()
}

fn unix_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_schema;
    use lofty::picture::{MimeType, Picture};
    use lofty::tag::items::Timestamp;
    use lofty::tag::{Tag, TagType};

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn picture_with_len(len: usize) -> Picture {
        Picture::unchecked(vec![b'A'; len])
            .mime_type(MimeType::Jpeg)
            .build()
    }

    #[test]
    fn test_cover_roundtrip_and_overwrite() {
        let conn = test_conn();
        assert_eq!(load_cover(&conn, "/music/a.mp3").unwrap(), None);

        store_cover(&conn, "/music/a.mp3", b"first", 1_000).unwrap();
        assert_eq!(
            load_cover(&conn, "/music/a.mp3").unwrap(),
            Some(b"first".to_vec())
        );

        // Storing again replaces the blob without adding a second row.
        store_cover(&conn, "/music/a.mp3", b"second", 2_000).unwrap();
        assert_eq!(
            load_cover(&conn, "/music/a.mp3").unwrap(),
            Some(b"second".to_vec())
        );

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM covers", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // Other paths stay untouched and independently keyed.
        store_cover(&conn, "/music/b.flac", b"other", 3_000).unwrap();
        assert_eq!(
            load_cover(&conn, "/music/b.flac").unwrap(),
            Some(b"other".to_vec())
        );
        assert_eq!(
            load_cover(&conn, "/music/a.mp3").unwrap(),
            Some(b"second".to_vec())
        );
    }

    #[test]
    fn test_cover_keys_are_independent() {
        let conn = test_conn();
        store_cover(&conn, "/music/a.mp3", b"one", 1).unwrap();
        store_cover(&conn, "/music/b.flac", b"two", 2).unwrap();
        assert_eq!(load_cover(&conn, "/music/a.mp3").unwrap(), Some(b"one".to_vec()));
        assert_eq!(load_cover(&conn, "/music/b.flac").unwrap(), Some(b"two".to_vec()));
        assert_eq!(
            load_cover(&conn, "/music/missing.mp3").unwrap(),
            None,
            "unknown path resolves to None, not an error"
        );

        // Cover keys never collide with the plain-path thumbnail namespace:
        // a separate table means even a file literally named like the prefix
        // would not be reachable from `thumbnails`.
        let thumbs: i64 = conn
            .query_row("SELECT COUNT(*) FROM thumbnails", [], |row| row.get(0))
            .unwrap();
        assert_eq!(thumbs, 0);
    }

    #[test]
    fn test_audio_metadata_serde_shape() {
        let meta = AudioMetadata {
            title: Some("Track".into()),
            artist: Some("Artist".into()),
            album_artist: Some("Album Artist".into()),
            album: Some("Album".into()),
            year: Some(1987),
            track_number: Some(3),
            disc_number: None,
            genre: Some("Rock".into()),
            duration_seconds: Some(212.5),
            has_cover: true,
        };

        let json = serde_json::to_value(&meta).unwrap();

        // camelCase keys arrive over IPC, matching the front-end interface.
        assert_eq!(json["albumArtist"], "Album Artist");
        assert_eq!(json["trackNumber"], 3);
        assert_eq!(json["discNumber"], serde_json::Value::Null);
        assert_eq!(json["durationSeconds"], 212.5);
        assert_eq!(json["hasCover"], true);

        // Roundtrip: every field survives a serialize/deserialize cycle.
        let back: AudioMetadata = serde_json::from_value(json).unwrap();
        assert_eq!(back, meta);
    }

    #[test]
    fn test_best_picture_prefers_largest() {
        let mut tag = Tag::new(TagType::Id3v2);
        tag.push_picture(picture_with_len(10));
        tag.push_picture(picture_with_len(40));
        tag.push_picture(picture_with_len(20));

        let best = best_picture(&[tag]).unwrap();
        assert_eq!(best.data().len(), 40);

        // Empty tag data resolves to no picture at all.
        assert_eq!(best_picture(&[]), None);
        assert_eq!(best_picture(&[Tag::new(TagType::Id3v2)]), None);
    }

    #[test]
    fn test_year_of_accepts_and_rejects() {
        let mut tag = Tag::new(TagType::Id3v2);
        tag.insert_text(ItemKey::Year, "1987".to_string());
        assert_eq!(year_of(&tag), Some(1987));

        // Full dates resolve to their year component.
        let mut dated = Tag::new(TagType::Id3v2);
        dated.insert_text(ItemKey::RecordingDate, "1999-03-21".to_string());
        assert_eq!(year_of(&dated), Some(1999));

        // Placeholder/absent years resolve to None.
        let mut zero = Tag::new(TagType::Id3v2);
        zero.insert_text(ItemKey::Year, "0000".to_string());
        assert_eq!(year_of(&zero), None);
        assert_eq!(year_of(&Tag::new(TagType::Id3v2)), None);
    }

    #[test]
    fn test_year_of_timestamp_shape() {
        // The relaxed Timestamp parse keeps only what is present; a bare
        // year keeps `year` and drops the rest.
        let mut tag = Tag::new(TagType::Id3v2);
        tag.insert_text(ItemKey::Year, "2024".to_string());
        let date: Option<Timestamp> = tag.date();
        assert_eq!(date.map(|d| d.year), Some(2024));
        assert_eq!(date.and_then(|d| d.month), None);
    }

    /// Unparsable audio files degrade to `None` on both read paths: a
    /// `.flac` whose content is not a FLAC stream fails lofty's parser (a
    /// garbage `.mp3` would instead parse to an empty-but-valid tag set).
    #[test]
    fn test_unreadable_audio_yields_none() {
        let dir = std::env::temp_dir().join("kanea_test_audio_meta");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let garbage = dir.join("garbage.flac");
        std::fs::write(&garbage, b"not a real flac stream").unwrap();

        assert_eq!(metadata_from_path(&garbage), None);
        assert_eq!(read_cover_bytes(&garbage), None);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
