#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod library;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;

                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");
                window.open_devtools();
            }
            #[cfg(not(debug_assertions))]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::scan_library_dir,
            library::default_media_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
