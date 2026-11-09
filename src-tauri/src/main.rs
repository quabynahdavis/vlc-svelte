#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::scan_library_dir,
            library::default_media_dir,
            db::db_get,
            db::db_set,
            thumb::thumb_get,
            thumb::thumb_generate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
