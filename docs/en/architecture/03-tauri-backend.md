# Tauri Backend

**Status:** the Tauri **v2 backend is implemented**: the SQLite persistence layer, the disk scanner, the ffmpeg thumbnail pipeline, the audio metadata/cover-art pipeline and the waveform pipeline are all live, with thirteen commands registered through `.invoke_handler(...)` and `tauri-plugin-dialog` as the single plugin crate. The Content Security Policy is still **planned**. Last updated 2026-11-12.

## `Cargo.toml`

```toml
[package]
name = "kanea"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-dialog = "2"
rusqlite = { version = "0.32", features = ["bundled"] }
walkdir = "2"
dirs = "5"
lofty = "0.25"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

| Item | Notes |
| --- | --- |
| Package | `kanea`, version `1.0.0`, Rust edition 2021 |
| `tauri` | Version 2 with the `protocol-asset` feature (the `asset://` protocol the library streams media through). The v1 allowlist features (`dialog-all`, `fs-all`, `shell-all`) are gone; v2 uses plugin crates instead. |
| `tauri-plugin-dialog` | The only plugin crate. Backs the native folder picker used by "Add folder…" (`dialog:default` capability). |
| `rusqlite` | Version 0.32, `bundled` feature; powers the persistence layer |
| `walkdir` | Recursive media scanning for `scan_library_dir` |
| `dirs` | `HOME`-anchored default media directory resolution |
| `lofty` | Version 0.25; audio tag and embedded artwork parsing for the metadata/cover-art commands |
| Source layout | Desktop-only: `src/main.rs` plus the modules `asset_scope`, `audio_meta`, `db`, `library` and `thumb`; there is no `lib.rs` or mobile entry point |

## `tauri.conf.json` (v2)

The file uses the v2 schema. Current keys:

| Key | Value | Comment |
| --- | --- | --- |
| `$schema` | `https://schema.tauri.app/config/2` | v2 schema |
| `productName` | `Kanea` | Top-level in v2 |
| `version` | `1.0.0` | Top-level in v2 |
| `identifier` | `com.kanea.player` | Top-level in v2 |
| `build.beforeDevCommand` | `bun run dev:frontend` | Starts Vite only; no Tauri re-entry |
| `build.beforeBuildCommand` | `bun x vite build` | Builds the frontend before bundling |
| `build.devUrl` | `http://localhost:5173` | Matches Vite's fixed port |
| `build.frontendDist` | `gen/dist` | Resolved relative to `src-tauri/`, i.e. `src-tauri/gen/dist/` |
| `app.windows[0]` | title `Kanea`, 1200 × 800, resizable, not fullscreen, `decorations: false` | Main window with the in-app title bar |
| `app.security.csp` | `null` | No CSP; tighten before release |
| `app.security.assetProtocol` | `enable: true`, `scope.allow: []`, `requireLiteralLeadingDot: false` | The `asset://` protocol is enabled but the shipped allow list is **empty**; the real scope is managed at runtime (see [Permissions and security](#permissions-and-security)) |
| `bundle.active` | `true` | Bundling enabled |
| `bundle.targets` | `all` | All platform targets |
| `bundle.icon` | 5 icon paths | See [Icons](#icons) |

There is no `allowlist` block and no `package` / `tauri` wrapper: those were v1-only keys.

## `src-tauri/src/main.rs`

Current flow:

1. `tauri::Builder::default()`
2. `.plugin(tauri_plugin_dialog::init())` — registers the dialog plugin
3. `.setup(|app| { ... })`:
   - in **debug** builds, resolves `app.get_webview_window("main")` (v2 API) and calls `window.open_devtools()`;
   - opens the SQLite database once via `db::open_database(app.handle())` and `app.manage(...)`s it, so every command call shares one connection;
   - manages the empty `AssetScopeRoots` state (`std::sync::Mutex<Vec<PathBuf>>`) that backs the runtime asset-protocol scope;
4. `.invoke_handler(tauri::generate_handler![...])` — registers the ten commands listed below
5. `.run(tauri::generate_context!())`
6. `.expect("error while running tauri application")`

`build.rs` contains only `fn main() { tauri_build::build() }`.

## Registered Tauri commands

All thirteen commands are wired in `main.rs`'s `generate_handler!` and each has a typed TypeScript wrapper in `src/lib/` (`tauriFs.ts`, `dbPersistence.ts`, `thumbnails.ts`, `audioMeta.ts`).

| Command | Module | Signature (Rust side) | Purpose |
| --- | --- | --- | --- |
| `scope_assets` | `asset_scope.rs` | `(app, state: State<AssetScopeRoots>, roots: Vec<String>) -> Result<(), String>` | Runtime asset-protocol allowlist: diffs old vs new normalized roots case-insensitively, then `forbid_directory` (recursive) for removed and `allow_directory` (recursive) for added roots; replaces the managed state. Empty `roots` allows nothing. Best-effort per entry; collected errors are returned as one string. |
| `scan_library_dir` | `library.rs` | `(root: String, max_depth: Option<u32>, include_hidden: Option<bool>) -> Result<ScanResult, String>` | Recursive media scan (`walkdir`, depth defaults to 4, hidden subtrees pruned unless `includeHidden`), filtered to `VIDEO_EXTENSIONS` + `AUDIO_EXTENSIONS`; symlinks skipped, deterministic ordering. Returns `ScanResult { root, folders, files }` with `sizeBytes` per file (serde camelCase). |
| `default_media_dir` | `library.rs` | `(kind: String) -> Result<Option<String>, String>` | Well-known media directory: `kind == "videos"` → `~/Videos`, `kind == "music"` → `~/Music`, anything else → `None`. Linux resolution prefers `xdg-user-dir` but only accepts an answer that is a directory under the current `HOME` and not the bare `HOME`; otherwise falls back to `HOME/<Kind>`. |
| `db_get` | `db.rs` | `(state: State<Database>, key: String) -> Result<Option<String>, String>` | Read a JSON blob from the `kv` table (`None` when never written). |
| `db_set` | `db.rs` | `(state: State<Database>, key: String, value: String) -> Result<(), String>` | Upsert a JSON blob into `kv` (`updated_at` epoch-milliseconds). |
| `thumb_get` | `thumb.rs` | `(state: State<Database>, path: String) -> Result<Option<Vec<u8>>, String>` | Read a persisted JPEG frame blob from `thumbnails` (`None` when never stored). |
| `thumb_generate` | `thumb.rs` | `(state: State<Database>, path: String, seek_seconds: f64) -> Result<Option<Vec<u8>>, String>` | Extract one frame with `/usr/bin/ffmpeg` (`-frames:v 1`, scale to 240px height; seek clamped 0.05–45 s; 2 MB output cap with kill, 10 s watchdog), `INSERT OR REPLACE` into `thumbnails`, and return the JPEG bytes — the whole pipeline in a single IPC roundtrip. Any failure (non-absolute path, non-video container, missing file, missing ffmpeg binary, failed extraction) degrades to `Ok(None)`. |
| `read_audio_metadata` | `audio_meta.rs` | `(path: String) -> Option<AudioMetadata>` | Tag/duration/cover-presence read via `lofty` for files whose extension is in `AUDIO_EXTENSIONS`. Returns `None` — never a panic — for non-audio extensions, unreadable files or unparsable containers (WMA/ASF and Matroska audio are not lofty-parsable). Struct fields (serde camelCase): `title`, `artist`, `albumArtist`, `album`, `year`, `trackNumber`, `discNumber`, `genre`, `durationSeconds`, `hasCover`. Duration comes from container properties; a zero duration maps to `None` so the frontend keeps its own probing. |
| `cover_get` | `audio_meta.rs` | `(state: State<Database>, path: String) -> Result<Option<Vec<u8>>, String>` | Read a persisted artwork blob from `covers` (`None` when never stored). |
| `cover_extract` | `audio_meta.rs` | `(state: State<Database>, path: String) -> Result<Option<Vec<u8>>, String>` | Extract embedded artwork via `lofty` (`best_picture` — largest picture wins), persist it into `covers`, and return the bytes — mirroring `thumb_generate` in a single IPC roundtrip. `None` on non-absolute paths, non-audio containers, missing files, no embedded artwork or unparsable containers. |
| `waveform_peaks` | `waveform.rs` | `(path: String, buckets: Option<u32>) -> Result<Vec<u16>, String>` | Decode audio via ffmpeg to mono PCM, compute peak-per-bucket across `buckets` (clamped 50–2000, default 800), return vector of `u16` peaks (0–65535). Non-audio extensions, missing files or decode failures return empty vector (never a panic). |
| `waveform_get` | `waveform.rs` | `(state: State<Database>, path: String) -> Result<Option<Vec<u8>>, String>` | Read a persisted waveform peaks blob from the `waveforms` table (`None` when never stored). |
| `waveform_generate` | `waveform.rs` | `(state: State<Database>, path: String, buckets: Option<u32>) -> Result<Option<Vec<u8>>, String>` | Generate peaks via `waveform_peaks` (default 800 buckets), `INSERT OR REPLACE` into `waveforms`, and return the serialized peaks — mirroring `thumb_generate` in a single IPC roundtrip. Any failure degrades to `Ok(None)`. |

Design notes that all commands follow:

- Serialisable structs with `serde` and `#[serde(rename_all = "camelCase")]` (`ScanResult`, `AudioMetadata`, …).
- Non-absolute paths are rejected by the thumbnail and cover-art commands; the asset scope (not the commands) is what gates which directories are reachable at all.
- Long-running work runs on the command thread pool (`#[tauri::command(async)]`) or a capped/kill-guarded child process (`ffmpeg`).

## Persistence (`db.rs`)

A single SQLite database at `app_data_dir/kanea.db`, opened once in the setup hook and shared behind `Database(Mutex<Connection>)`:

- **Journal mode:** WAL with `synchronous = NORMAL`; both pragmas are read through `.optional()` because write-only pragma assignments return no rows (a plain `query_row` once crashed the setup hook with `QueryReturnedNoRows`).
- **Schema** (idempotent `CREATE TABLE IF NOT EXISTS`, applied on every open):

| Table | Columns | Domain |
| --- | --- | --- |
| `kv` | `key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL` | All persisted store blobs, mirroring the versioned `vlc.*.v1` keys one-to-one |
| `thumbnails` | `path TEXT PRIMARY KEY, data BLOB NOT NULL, updated_at INTEGER NOT NULL` | JPEG video frames keyed by the media item's absolute path |
| `covers` | `path TEXT PRIMARY KEY, data BLOB NOT NULL, updated_at INTEGER NOT NULL` | Embedded audio artwork keyed by the same absolute-path convention |
| `waveforms` | `path TEXT PRIMARY KEY, data BLOB NOT NULL, updated_at INTEGER NOT NULL` | Audio waveform peaks (serialized `Vec<u16>`) keyed by the media item's absolute path |

- `thumbnails`, `covers` and `waveforms` are deliberately **separate tables** rather than one table with key prefixes: video frames, artwork and waveforms are separate domains, and prefix-stuffing a file-path primary key would conflate the key namespaces.

## Frontend build integration

- `vite.config.ts` sets `build.outDir: 'src-tauri/gen/dist'` (relative to the Vite project root) with `emptyOutDir: true`. Commit `b6c72c0` fixed the previous `../src-tauri/gen/dist`, which resolved **outside** the repository.
- `build.frontendDist: "gen/dist"` is resolved relative to `src-tauri/tauri.conf.json`, so it points at the same physical directory: `src-tauri/gen/dist/`.
- The dev server is fixed to port **5173** with `strictPort: true`; `build.devUrl` must stay `http://localhost:5173`.
- `src-tauri/gen/` is gitignored, so frontend build output is never committed.

### Script behaviour

`package.json` currently defines:

| Script | Command | Effect |
| --- | --- | --- |
| `dev` | `bun run dev:tauri` | Default desktop workflow |
| `dev:frontend` | `vite` | Browser-only dev server on 5173 |
| `dev:tauri` | `tauri dev` | Tauri starts Vite through `beforeDevCommand`, then opens the window |
| `build` | `bunx tauri build` | Tauri builds the frontend once through `beforeBuildCommand`, then bundles |
| `check` | `svelte-check --tsconfig ./tsconfig.json` | Type-check `.svelte` and TypeScript files |
| `preview` | `vite preview` | Serve the built frontend on 4173 |
| `tauri` | `tauri` | Pass-through to the Tauri CLI |

Consequences:

- **Use `bun run dev` (or `bun run dev:tauri`) for desktop development.** Do not also run `dev:frontend`; the second Vite instance cannot bind port 5173 because `strictPort` is enabled.
- **`bun run build` is a single Tauri build.** It does not run Vite separately before `tauri build`, so the frontend is built once.
- **Frontend-only build:** `bunx vite build` writes `src-tauri/gen/dist/`. Run `bun run preview` to serve that output on port 4173.
- **Type checking:** `bun run check` is separate from both Vite and Tauri builds.

## Icons

`src-tauri/icons/` contains the default Tauri placeholder icons, not project branding:

| File | Purpose |
| --- | --- |
| `32x32.png` | Small window/taskbar icon |
| `128x128.png` | Standard app icon |
| `128x128@2x.png` | High-DPI app icon |
| `icon.icns` | macOS bundle icon |
| `icon.ico` | Windows executable icon |
| `icon.png` | Present but **not** referenced by `bundle.icon` |

Replacing them with a Kanea icon set is **planned**. Keep every size referenced by `bundle.icon`; missing files break bundling.

## Permissions and security

- The v1 allowlist is gone. Tauri v2 uses **capabilities** in `src-tauri/capabilities/`.
- `capabilities/default.json` targets the `main` window and grants the six core window permissions plus the dialog plugin's default set:
  - `core:window:allow-minimize`
  - `core:window:allow-toggle-maximize`
  - `core:window:allow-close`
  - `core:window:allow-start-dragging`
  - `core:window:allow-internal-toggle-maximize`
  - `core:window:allow-set-decorations`
  - `dialog:default`
- The six core permissions back the custom title bar: minimise, maximise/restore, close, dragging, double-click-to-maximise and the `useSystemTitleBar` runtime switch. `dialog:default` backs the native folder picker.
- **Runtime-managed asset protocol scope:** `tauri.conf.json` ships `assetProtocol.scope.allow: []` (empty), and the setup hook manages an empty `AssetScopeRoots` state — the app starts allowing **nothing**. The frontend (`src/stores/settings.ts`) computes `scopedLibraryFolders()`, the deduped union of the configured video + music library roots, and syncs it once after settings hydration and reactively on every change via `scope_assets`. That command diffs old vs new normalized roots and calls `asset_protocol_scope().allow_directory(path, true)` / `forbid_directory(path, true)` accordingly, so removals actually revoke. The webview can only read exactly the folders the user configured — one privilege per root, no blanket globs (`$HOME/**`, `/run/media/**`, …).
- **Waveform scope:** the three waveform commands (`waveform_peaks`, `waveform_get`, `waveform_generate`) operate on the same asset roots — they read audio files from the configured library roots via the already-synced asset protocol. No new filesystem surface is exposed.
- `app.security.csp` is `null`. Set a restrictive policy before release.
- `tauri-plugin-fs` / `tauri-plugin-shell` are deliberately not installed: the scanner, thumbnail, metadata and waveform commands read the filesystem from Rust, and no shell execution is exposed to the webview.

## Window chrome

- `app.windows[0].decorations` is `false`, so the window opens without native chrome and the Svelte `TitleBar` provides the controls.
- Interface settings expose `useSystemTitleBar`. `src/lib/windowChrome.ts` calls `setDecorations(!useSystem)` when the setting changes, and `App.svelte` hides the in-app title bar when native decorations are enabled.
- The runtime toggle depends on `core:window:allow-set-decorations`; removing that permission breaks the setting.

## Migration checklist

| Step | Status |
| --- | --- |
| Upgrade JS packages to `@tauri-apps/api` / `@tauri-apps/cli` v2 | Done |
| Set Rust `tauri` / `tauri-build` to v2 | Done |
| Remove the v1 allowlist feature flags | Done (features are `protocol-asset` only) |
| Rewrite `tauri.conf.json` to the v2 schema (`productName`, `version`, `identifier`, `app.windows`, `app.security`, `bundle`, `devUrl`, `frontendDist`) | Done (commit `9d6fa1a`) |
| Replace `get_window` with `get_webview_window` | Done (commit `9d6fa1a`) |
| Point `beforeDevCommand` / `beforeBuildCommand` at bun frontend-only scripts | Done |
| Fix Vite `outDir` to resolve inside the project | Done (commit `b6c72c0`) |
| Add `capabilities/` with least-privilege window permissions | Done (`capabilities/default.json`) |
| Disable native decorations and add the custom/system title bar toggle | Done |
| Install the required v2 plugin crates | Done (`tauri-plugin-dialog`) |
| Register plugins and an `invoke_handler` | Done (thirteen commands) |
| SQLite persistence (`kv`, `thumbnails`, `covers`, `waveforms` tables in `app_data_dir/kanea.db`) | Done |
| Native file dialog for "Add folder…" | Done (`dialog:default`) |
| Disk scanning, default media directory (`videos` / `music`) | Done |
| ffmpeg thumbnail pipeline (`thumb_get` / `thumb_generate`) | Done |
| Audio metadata + cover art (`read_audio_metadata`, `cover_get`, `cover_extract`) | Done |
| Runtime asset scope synced from library roots (`scope_assets`) | Done |
| Waveform pipeline (`waveform_peaks`, `waveform_get`, `waveform_generate`) | Done |
| Replace placeholder icons with project branding | Planned |
| Set a Content Security Policy | Planned |
