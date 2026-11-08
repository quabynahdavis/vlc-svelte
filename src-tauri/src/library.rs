use std::path::{Path, PathBuf};
use std::fs;
use serde::{Serialize, Deserialize};

/// Media file extensions (case-insensitive filter)
const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mkv", "webm", "mov", "avi", "ogv", "mp3", "m4a", "aac",
    "flac", "ogg", "oga", "opus", "wav", "wma", "mka",
];

fn is_media_extension(name: &str) -> bool {
    let ext = Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    MEDIA_EXTENSIONS.iter().any(|e| **e == ext)
}

/// True when the final path component starts with a dot (hidden on unix).
fn is_hidden_name(path: &Path) -> bool {
    path.file_name()
        .map(|n| n.to_string_lossy().starts_with('.'))
        .unwrap_or(false)
}

/// A scanned media file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub name: String,
    pub relative_path: String,
    pub path: String,
    pub size_bytes: u64,
}

/// A scanned folder
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFolder {
    pub name: String,
    pub path: String,
    pub files: u32,
    pub total: u32,
}

/// Scan result from scanning a media directory
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root: String,
    pub folders: Vec<ScannedFolder>,
    pub files: Vec<ScannedFile>,
}

/// Recursively scan a directory for media files up to max_depth
#[tauri::command(async)]
pub fn scan_library_dir(root: String, max_depth: Option<u32>, include_hidden: Option<bool>) -> Result<ScanResult, String> {
    let root_path = PathBuf::from(&root);
    let max_depth = max_depth.unwrap_or(4) as usize;
    let include_hidden = include_hidden.unwrap_or(false);
    let result = scan_media_dir(&root_path, max_depth, include_hidden)?;
    Ok(result)
}

#[tauri::command(async)]
pub fn default_media_dir(kind: String) -> Result<Option<String>, String> {
    eprintln!("default_media_dir called with kind: {}", kind);
    let result = default_media_dir_fn(&kind).map(|p| p.to_string_lossy().to_string());
    eprintln!("default_media_dir result: {:?}", result);
    Ok(result)
}

fn scan_media_dir(
    root: &Path,
    max_depth: usize,
    include_hidden: bool,
) -> Result<ScanResult, String> {
    if !root.exists() {
        return Err(format!("Root path does not exist: {:?}", root));
    }
    if !root.is_dir() {
        return Err(format!("Root path is not a directory: {:?}", root));
    }

    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut folders: Vec<ScannedFolder> = Vec::new();
    let mut files: Vec<ScannedFile> = Vec::new();

    // Walk the directory tree up to max_depth; prune hidden subtrees entirely.
    let walker = walkdir::WalkDir::new(root).max_depth(max_depth);
    for entry in walker
        .into_iter()
        .filter_entry(|e| {
        if include_hidden {
            return true;
        }
        !e.file_name().to_str().map(|s| s.starts_with('.')).unwrap_or(false)
    }) {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("WalkDir error: {}", e);
                continue;
            }
        };

        let path = entry.path();
        let file_type = entry.file_type();

        // Skip symlinks
        if file_type.is_symlink() {
            continue;
        }

        // Process files
        if file_type.is_file() {
            if !is_media_extension(&path.to_string_lossy()) {
                continue;
            }

            let relative_path = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default()
                .to_string();

            let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

            files.push(ScannedFile {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                relative_path,
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
            });
        } else if file_type.is_dir() {
            // Skip the root directory itself
            if path == root {
                continue;
            }

            let relative_path = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default()
                .to_string();

            let total_media = count_media_files(path, include_hidden);

            // Direct media count: media files that are direct children.
            let direct = fs::read_dir(path)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            if !include_hidden && is_hidden_name(&e.path()) {
                                return false;
                            }
                            e.metadata()
                                .ok()
                                .map(|m| m.file_type().is_file() && is_media_extension(&e.path().to_string_lossy()))
                                .unwrap_or(false)
                        })
                        .count()
                })
                .unwrap_or(0);

            folders.push(ScannedFolder {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                path: relative_path,
                files: direct as u32,
                total: total_media,
            });
        }
    }

    Ok(ScanResult {
        root: root_name,
        folders,
        files,
    })
}

/// Count all media files recursively under a directory
fn count_media_files(dir: &Path, include_hidden: bool) -> u32 {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let meta = entry.metadata();
            let is_symlink = meta
                .as_ref()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);

            if is_symlink {
                continue;
            }

            if !include_hidden {
                if let Some(name) = path.file_name() {
                    if name.to_string_lossy().starts_with('.') {
                        continue;
                    }
                }
            }

            let is_dir = meta.as_ref().map(|m| m.file_type().is_dir()).unwrap_or(false);
            let is_file = meta.as_ref().map(|m| m.file_type().is_file()).unwrap_or(false);

            if is_dir {
                count += count_media_files(&path, include_hidden);
            } else if is_file {
                if is_media_extension(&path.to_string_lossy()) {
                    count += 1;
                }
            }
        }
    }
    count
}

/// Get the default videos directory path
pub fn default_media_dir_fn(kind: &str) -> Option<PathBuf> {
    if kind != "videos" {
        return None;
    }

    // Try xdg-user-dir on Linux
    if cfg!(target_os = "linux") {
        if let Ok(output) = std::process::Command::new("xdg-user-dir")
            .arg("VIDEOS")
            .output()
        {
            if let Ok(path) = String::from_utf8(output.stdout) {
                let trimmed = path.trim();
                if !trimmed.is_empty() {
                    let p = PathBuf::from(trimmed);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }
    }

    // Fallback: HOME + Videos
    if let Some(home) = dirs::home_dir() {
        let videos = home.join("Videos");
        if videos.is_dir() {
            return Some(videos);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    #[test]
    fn test_scan_media_dir_basic() {
        let tmp_dir = env::temp_dir().join("kanea_test_lib");
        let _ = fs::remove_dir_all(&tmp_dir);
        let _ = fs::create_dir_all(&tmp_dir);

        // Create test structure:
        // Videos/S01/{Ep1.mkv, Ep2.mp4, subs.srt}
        // Videos/movie.mkv
        // Videos/notes.txt
        // hidden .tmp dir
        let videos_dir = tmp_dir.join("Videos");
        let s01_dir = videos_dir.join("S01");
        let hidden_dir = videos_dir.join(".tmp");

        let _ = fs::create_dir_all(&s01_dir);
        let _ = fs::create_dir_all(&hidden_dir);

        let _ = fs::write(videos_dir.join("movie.mkv"), b"fake");
        let _ = fs::write(videos_dir.join("notes.txt"), b"not media");
        let _ = fs::write(s01_dir.join("Ep1.mkv"), b"media");
        let _ = fs::write(s01_dir.join("Ep2.mp4"), b"media");
        let _ = fs::write(s01_dir.join("subs.srt"), b"subs");
        let _ = fs::write(s01_dir.join(".hidden"), b"hidden");
        let _ = fs::write(hidden_dir.join("hidden.mkv"), b"hidden media");

        let result = scan_media_dir(&videos_dir, 3, false).unwrap();

        assert_eq!(result.files.len(), 3);
        let movie_names: Vec<&str> = result.files.iter().map(|f| f.name.as_str()).collect();
        assert!(movie_names.contains(&"movie.mkv"));

        let s01_folder = result.folders.iter().find(|f| f.name == "S01").unwrap();
        assert_eq!(s01_folder.files, 2);
        assert_eq!(s01_folder.total, 2);

        let ep_files: Vec<&ScannedFile> = result
            .files
            .iter()
            .filter(|f| f.relative_path.starts_with("S01/"))
            .collect();
        assert_eq!(ep_files.len(), 2);

        let _ = fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_scan_media_dir_depth_limit() {
        let tmp_dir = env::temp_dir().join("kanea_test_depth");
        let _ = fs::remove_dir_all(&tmp_dir);
        let _ = fs::create_dir_all(&tmp_dir);

        let videos_dir = tmp_dir.join("Videos");
        let s01_dir = videos_dir.join("S01");
        let s02_dir = videos_dir.join("S02");

        let _ = fs::create_dir_all(&s01_dir);
        let _ = fs::create_dir_all(&s02_dir);
        let _ = fs::write(s01_dir.join("Ep1.mkv"), b"media");
        let _ = fs::write(s02_dir.join("Ep2.mkv"), b"media");

        let result = scan_media_dir(&videos_dir, 1, false).unwrap();

        let folder_names: Vec<&str> = result.folders.iter().map(|f| f.name.as_str()).collect();
        assert!(folder_names.contains(&"S01"));

        let file_names: Vec<&str> = result.files.iter().map(|f| f.name.as_str()).collect();
        assert!(!file_names.contains(&"Ep1.mkv"));

        let _ = fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_scan_media_dir_hidden() {
        let tmp_dir = env::temp_dir().join("kanea_test_hidden");
        let _ = fs::remove_dir_all(&tmp_dir);
        let _ = fs::create_dir_all(&tmp_dir);

        let videos_dir = tmp_dir.join("Videos");
        let s01_dir = videos_dir.join("S01");
        let hidden_dir = videos_dir.join(".hidden");

        let _ = fs::create_dir_all(&s01_dir);
        let _ = fs::create_dir_all(&hidden_dir);
        let _ = fs::write(videos_dir.join("movie.mkv"), b"media");
        let _ = fs::write(s01_dir.join("Ep1.mkv"), b"media");
        let _ = fs::write(hidden_dir.join("secret.mkv"), b"hidden media");

        let result = scan_media_dir(&videos_dir, 3, false).unwrap();
        let file_names: Vec<&str> = result.files.iter().map(|f| f.name.as_str()).collect();
        assert!(!file_names.contains(&"secret.mkv"));

        let _ = fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_default_media_dir_videos() {
        let _ = default_media_dir_fn("videos");
    }
}
