#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod asset_scope;
mod audio_meta;
mod db;
mod duration;
mod library;
mod player;
mod thumb;
mod waveform;

/// Build a `vlcframe://` protocol response. `Response::builder` only fails on
/// invalid header values/statuses, which are static here — the fallback is an
/// empty 200 the frontend already treats as "no new frame" (it validates the
/// 16-byte header before painting).
fn frame_response(
    status: tauri::http::StatusCode,
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header(tauri::http::header::CONTENT_TYPE, "application/octet-stream")
        .header(tauri::http::header::CACHE_CONTROL, "no-store")
        // The dev page (vite) and the packaged page have different origins;
        // `*` keeps `fetch` happy on WebKit without reading headers client-side.
        .header(tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

fn main() {
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Video-surface prototype (Phase 2): serves the latest libvlc frame
        // to the webview canvas. Body layout is self-describing binary —
        // [seq: u64 LE][width: u32 LE][height: u32 LE][rgba bytes...] — so
        // the frontend never relies on response headers being readable.
        // No live frame (audio-only media, before the first format callback,
        // after stop): `204 No Content` with an empty body — chosen over 404
        // because the poll loop treats "nothing new" as a normal event, not
        // an error. Windows webviews fetch `http://vlcframe.localhost/frame`
        // instead (Tauri maps custom schemes there); the handler itself is
        // scheme-agnostic.
        .register_uri_scheme_protocol("vlcframe", |_ctx, _request| {
            match player::vlc_frame_snapshot() {
                Some((width, height, seq, rgba)) => {
                    let mut body = Vec::with_capacity(16 + rgba.len());
                    body.extend_from_slice(&seq.to_le_bytes());
                    body.extend_from_slice(&width.to_le_bytes());
                    body.extend_from_slice(&height.to_le_bytes());
                    body.extend_from_slice(&rgba);
                    frame_response(tauri::http::StatusCode::OK, body)
                }
                None => frame_response(tauri::http::StatusCode::NO_CONTENT, Vec::new()),
            }
        })
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");
                window.open_devtools();
            }

            // SQLite persistence: opened once, shared across command calls.
            let database = db::open_database(app.handle())?;
            app.manage(database);

            // Runtime-managed asset protocol scope: starts empty, synced from
            // the user's configured library roots after settings hydration.
            app.manage(std::sync::Mutex::new(Vec::<std::path::PathBuf>::new())
                as asset_scope::AssetScopeRoots);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            asset_scope::scope_assets,
            library::scan_library_dir,
            library::default_media_dir,
            db::db_get,
            db::db_set,
            thumb::thumb_get,
            thumb::thumb_generate,
            audio_meta::read_audio_metadata,
            audio_meta::cover_get,
            audio_meta::cover_extract,
            waveform::waveform_peaks,
            waveform::waveform_get,
            waveform::waveform_generate,
            duration::media_duration,
            player::player_probe,
            player::player_load,
            player::player_play,
            player::player_pause,
            player::player_toggle,
            player::player_stop,
            player::player_seek,
            player::player_set_volume,
            player::player_position,
            player::player_audio_tracks,
            player::player_set_audio_track,
            player::player_spu_tracks,
            player::player_set_spu,
            player::player_add_subtitle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
