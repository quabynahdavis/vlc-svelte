use tauri::Manager;

/// Managed state for runtime-controlled asset protocol scope.
/// Process-scoped; holds a case-insensitive normalized list of library root paths.
pub type AssetScopeRoots = std::sync::Mutex<Vec<std::path::PathBuf>>;

/// Normalize a raw path string: trim, strip trailing separators, and, if the
/// path exists on disk, canonicalize it.  If the path does not exist keep the
/// cleaned string so the diff stays stable.
fn normalize_path(p: &str) -> std::path::PathBuf {
    let cleaned = p.trim().to_string();
    let cleaned = cleaned.trim_end_matches(|c: char| c == '/' || c == '\\');
    if std::path::Path::new(&cleaned).exists() {
        match std::path::PathBuf::from(&cleaned).canonicalize() {
            Ok(canonical) => canonical,
            Err(_) => std::path::PathBuf::from(cleaned),
        }
    } else {
        std::path::PathBuf::from(cleaned)
    }
}

/// Diff two slices of normalized paths using case‑insensitive comparison.
/// Returns (`added`, `removed`) vectors of `PathBuf`.
pub fn scope_diff(old: &[std::path::PathBuf], new: &[std::path::PathBuf]) -> (Vec<std::path::PathBuf>, Vec<std::path::PathBuf>) {
    let old_set: std::collections::HashSet<String> = old.iter().map(|p| p.to_string_lossy().to_lowercase()).collect();
    let new_set: std::collections::HashSet<String> = new.iter().map(|p| p.to_string_lossy().to_lowercase()).collect();

    let mut added = Vec::new();
    let mut removed = Vec::new();

    // Paths in `new` that are not (case‑insensitively) in `old` → added
    for p in new {
        if !old_set.contains(&p.to_string_lossy().to_lowercase()) {
            added.push(p.clone());
        }
    }

    // Paths in `old` that are not (case‑insensitively) in `new` → removed
    for p in old {
        if !new_set.contains(&p.to_string_lossy().to_lowercase()) {
            removed.push(p.clone());
        }
    }

    (added, removed)
}

// ==== Tauri command ====

/// Sync the asset‑protocol scope from the configured library roots.
///
/// - Calls `forbid_directory` (recursive) for every root that was removed.
/// - Calls `allow_directory`  (recursive) for every root that was added.
/// - Best‑effort per‑entry: errors are collected and returned, but processing
///   continues for the remaining entries.
/// - Replaces the managed state with the new normalized list.
/// - An empty `roots` list allows nothing (state is still updated).
#[tauri::command(async)]
pub async fn scope_assets(
    app: tauri::AppHandle,
    state: tauri::State<'_, AssetScopeRoots>,
    roots: Vec<String>,
) -> Result<(), String> {
    let roots_normalized: Vec<std::path::PathBuf> = roots.iter().map(|r| normalize_path(r)).collect();
    let old_roots = {
        let guard = state
            .lock()
            .map_err(|_| "asset_scope state lock failed".to_string())?;
        guard.clone()
    };

    let (added, removed) = scope_diff(&old_roots, &roots_normalized);

    let mut errors: Vec<String> = Vec::new();

    // Forbid directories that were removed (recursive = true).
    for path in &removed {
        if let Err(e) = app.asset_protocol_scope().forbid_directory(path, true) {
            errors.push(format!("forbid_directory {} error: {}", path.display(), e));
        }
    }

    // Allow directories that were added (recursive = true).
    for path in &added {
        if let Err(e) = app.asset_protocol_scope().allow_directory(path, true) {
            errors.push(format!("allow_directory {} error: {}", path.display(), e));
        }
    }

    // Replace the managed list with the new normalized roots.
    {
        let mut guard = state
            .lock()
            .map_err(|_| "asset_scope state lock failed".to_string())?;
        *guard = roots_normalized;
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_scope_diff_additions() {
        let old = vec![PathBuf::from("/a/b")];
        let new = vec![PathBuf::from("/a/b"), PathBuf::from("/c/d")];
        let (added, removed) = scope_diff(&old, &new);
        assert_eq!(added, vec![PathBuf::from("/c/d")]);
        assert!(removed.is_empty());
    }

    #[test]
    fn test_scope_diff_removals() {
        let old = vec![PathBuf::from("/a/b"), PathBuf::from("/c/d")];
        let new = vec![PathBuf::from("/a/b")];
        let (added, removed) = scope_diff(&old, &new);
        assert!(added.is_empty());
        assert_eq!(removed, vec![PathBuf::from("/c/d")]);
    }

    #[test]
    fn test_scope_diff_mixed() {
        let old = vec![PathBuf::from("/a/b"), PathBuf::from("/c/d")];
        let new = vec![PathBuf::from("/a/b"), PathBuf::from("/e/f")];
        let (added, removed) = scope_diff(&old, &new);
        assert_eq!(added, vec![PathBuf::from("/e/f")]);
        assert_eq!(removed, vec![PathBuf::from("/c/d")]);
    }

    #[test]
    fn test_scope_diff_no_op() {
        let old = vec![PathBuf::from("/a/b")];
        let new = vec![PathBuf::from("/a/b")];
        let (added, removed) = scope_diff(&old, &new);
        assert!(added.is_empty());
        assert!(removed.is_empty());
    }

    #[test]
    fn test_scope_diff_case_insensitive() {
        // Same path, different casing → no additions, no removals
        let old = vec![PathBuf::from("/A/B")];
        let new = vec![PathBuf::from("/a/b")];
        let (added, removed) = scope_diff(&old, &new);
        assert!(added.is_empty());
        assert!(removed.is_empty());
    }

    #[test]
    fn test_scope_diff_empty_new() {
        let old = vec![PathBuf::from("/a/b")];
        let new = vec![];
        let (added, removed) = scope_diff(&old, &new);
        assert!(added.is_empty());
        assert_eq!(removed, vec![PathBuf::from("/a/b")]);
    }

    #[test]
    fn test_scope_diff_empty_old() {
        let old = vec![];
        let new = vec![PathBuf::from("/a/b")];
        let (added, removed) = scope_diff(&old, &new);
        assert_eq!(added, vec![PathBuf::from("/a/b")]);
        assert!(removed.is_empty());
    }
}