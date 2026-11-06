mod library;

use library::{default_media_dir as default_media_dir_fn, scan_media_dir as scan_media_dir_fn, ScanResult};
use std::path::PathBuf;

/// Scan a directory for media files
#[tauri::command(async)]
pub fn scan_library_dir(root: String, max_depth: Option<u32>, include_hidden: Option<bool>) -> Result<ScanResult, String> {
    let root_path = PathBuf::from(&root);
    let max_depth = max_depth.map(|v| v as usize).unwrap_or(4);
    let include_hidden = include_hidden.unwrap_or(false);

    scan_media_dir_fn(&root_path, max_depth, include_hidden)
}

/// Get the default media directory for a kind (e.g., "videos")
#[tauri::command(async)]
pub fn default_media_dir(kind: String) -> Result<Option<String>, String> {
    Ok(default_media_dir_fn(&kind).map(|p| p.to_string_lossy().to_string()))
}

fn main() {
    tauri::Builder::default()
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
            scan_library_dir,
            default_media_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
