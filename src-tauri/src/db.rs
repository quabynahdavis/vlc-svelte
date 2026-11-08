//! SQLite-backed key-value persistence for the desktop shell.
//!
//! So far all preferences lived in webview `localStorage` under versioned
//! `vlc.*.v1` keys. Those blobs are invisible to Rust, bound to the webview
//! profile and quietly size-limited. The database mirrors the same keys
//! one-to-one in a `kv` table so front-end stores can adopt SQLite without
//! reshaping their data; WAL keeps writes crash-safe in the single file at
//! `app_data_dir/kanea.db`. When a domain outgrows its JSON blob the table
//! can be normalized later without moving the file.

use rusqlite::{Connection, OptionalExtension, params};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

/// Connection state shared across command calls.
pub struct Database(Mutex<Connection>);

const SCHEMA_SQL: &str =
    "CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );";

fn open_connection(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    // WAL keeps writes durable without blocking readers; NORMAL is the usual
    // SQLite recommendation for WAL and significantly reduces fsync cost.
    let _: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
    let _: String = conn.query_row("PRAGMA synchronous = NORMAL", [], |row| row.get(0))?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(conn)
}

/// Open (creating if needed) the database at `app_data_dir/kanea.db`.
pub fn open_database(handle: &tauri::AppHandle) -> Result<Database, Box<dyn std::error::Error>> {
    use tauri::Manager;

    let dir = handle.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let conn = open_connection(&dir.join("kanea.db"))?;
    Ok(Database(Mutex::new(conn)))
}

fn kv_get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM kv WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

fn kv_set(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<usize> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO kv (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at",
        params![key, value, now],
    )
}

/// Read a stored JSON blob. `None` means the key has never been written.
#[tauri::command]
pub fn db_get(state: State<'_, Database>, key: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    kv_get(&conn, &key).map_err(|e| e.to_string())
}

/// Write a JSON blob, replacing any previous value for the key.
#[tauri::command]
pub fn db_set(state: State<'_, Database>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "database is locked".to_string())?;
    kv_set(&conn, &key, &value).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();
        conn
    }

    #[test]
    fn test_kv_roundtrip() {
        let conn = test_conn();
        assert_eq!(kv_get(&conn, "vlc.settings.v1").unwrap(), None);

        kv_set(&conn, "vlc.settings.v1", r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(
            kv_get(&conn, "vlc.settings.v1").unwrap().as_deref(),
            Some(r#"{"theme":"dark"}"#)
        );
    }

    #[test]
    fn test_kv_upsert_replaces_value() {
        let conn = test_conn();
        kv_set(&conn, "vlc.watch.v1", r#"{"a":1}"#).unwrap();
        kv_set(&conn, "vlc.watch.v1", r#"{"a":2}"#).unwrap();
        assert_eq!(
            kv_get(&conn, "vlc.watch.v1").unwrap().as_deref(),
            Some(r#"{"a":2}"#)
        );

        // Exactly one row per key, never two after upserts.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM kv", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_kv_keys_are_independent() {
        let conn = test_conn();
        kv_set(&conn, "vlc.settings.v1", "one").unwrap();
        kv_set(&conn, "vlc.history.v1", "two").unwrap();
        assert_eq!(kv_get(&conn, "vlc.settings.v1").unwrap().as_deref(), Some("one"));
        assert_eq!(kv_get(&conn, "vlc.history.v1").unwrap().as_deref(), Some("two"));
    }
}
