#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod asset_scope;
mod audio_meta;
mod db;
mod library;
mod thumb;

fn main() {
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
