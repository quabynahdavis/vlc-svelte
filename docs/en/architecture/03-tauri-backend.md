# Tauri Backend

**Status:** the Tauri **v2 migration is complete** for the configuration schema and the Rust webview API (commit `9d6fa1a`). Window capabilities and custom/system decorations are implemented; plugin crates, native commands and a Content Security Policy are still **planned**. Last updated 2026-10-29.

## `Cargo.toml`

```toml
[package]
name = "vlc-redesign"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

| Item | Notes |
| --- | --- |
| Package | `vlc-redesign`, version `1.0.0`, Rust edition 2021 |
| `tauri` | Version 2, no feature flags. The v1 allowlist features (`dialog-all`, `fs-all`, `shell-all`) have been removed; v2 uses plugin crates instead. |
| `tauri-build` | Version 2, invoked by `build.rs` |
| Source layout | Desktop-only: only `src/main.rs` exists; there is no `lib.rs` or mobile entry point |
| Plugins | None declared. `tauri-plugin-dialog`, `tauri-plugin-fs` and `tauri-plugin-shell` are not installed. |

## `tauri.conf.json` (v2)

The file uses the v2 schema. Current keys:

| Key | Value | Comment |
| --- | --- | --- |
| `$schema` | `https://schema.tauri.app/config/2` | v2 schema |
| `productName` | `VLC Redesign` | Top-level in v2 |
| `version` | `1.0.0` | Top-level in v2 |
| `identifier` | `com.vlc-redesign.app` | Top-level in v2 |
| `build.beforeDevCommand` | `bun run dev:frontend` | Starts Vite only; no Tauri re-entry |
| `build.beforeBuildCommand` | `bun x vite build` | Builds the frontend before bundling |
| `build.devUrl` | `http://localhost:5173` | Matches Vite's fixed port |
| `build.frontendDist` | `gen/dist` | Resolved relative to `src-tauri/`, i.e. `src-tauri/gen/dist/` |
| `app.windows[0]` | title `VLC Redesign`, 1200 × 800, resizable, not fullscreen, `decorations: false` | Main window with the in-app title bar |
| `app.security.csp` | `null` | No CSP; tighten before release |
| `bundle.active` | `true` | Bundling enabled |
| `bundle.targets` | `all` | All platform targets |
| `bundle.icon` | 5 icon paths | See [Icons](#icons) |

There is no `allowlist` block and no `package` / `tauri` wrapper: those were v1-only keys.

## `src-tauri/src/main.rs`

Current flow:

1. `tauri::Builder::default()`
2. `.setup(|app| { ... })`:
   - in **debug** builds, imports `tauri::Manager`, resolves `app.get_webview_window("main")` (v2 API) and calls `window.open_devtools()`;
   - in **release** builds, binds `app` to `_` and does nothing.
3. `.run(tauri::generate_context!())`
4. `.expect("error while running tauri application")`

No commands are registered (`.invoke_handler(...)` is absent) and no plugins are registered (`.plugin(...)` is absent). `src-tauri/capabilities/default.json` exists, but it grants only core window permissions for the custom title bar. `build.rs` contains only `fn main() { tauri_build::build() }`.

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

Replacing them with a VLC Redesign icon set is **planned**. Keep every size referenced by `bundle.icon`; missing files break bundling.

## Planned Tauri commands

None of these exist yet. Signatures are indicative and should be finalised with the frontend types. The current library add flow uses HTML file/folder inputs and object URLs, so it does not call Rust.

| Command | Purpose | Planned implementation | Status |
| --- | --- | --- | --- |
| `open_media_dialog()` | Show a native file picker and return the selected path | `tauri-plugin-dialog`, called from Rust or the frontend | Planned |
| `list_media_directory(path)` | List playable files in a folder | Rust command using `std::fs` or `tauri-plugin-fs`; validate the path | Planned |
| `read_media_metadata(path)` | Read duration, codecs, resolution, title, etc. | Rust command; metadata library not chosen yet | Planned |

Design notes for future commands:

- Return serialisable structs (`MediaEntry`, `MediaMetadata`) with `serde`.
- Reject paths outside user-approved locations; do not expose arbitrary file-system access.
- Keep long-running probes off the UI thread (`async` command or `spawn_blocking`).
- Wrap each command in a typed function in the planned `src/lib/tauri.ts`.
- Register every command with `.invoke_handler(tauri::generate_handler![...])`.

## Permissions and security

- The v1 allowlist is gone. Tauri v2 uses **capabilities** in `src-tauri/capabilities/`.
- `capabilities/default.json` targets the `main` window and grants exactly six core permissions:
  - `core:window:allow-minimize`
  - `core:window:allow-toggle-maximize`
  - `core:window:allow-close`
  - `core:window:allow-start-dragging`
  - `core:window:allow-internal-toggle-maximize`
  - `core:window:allow-set-decorations`
- These permissions back the custom title bar: minimise, maximise/restore, close, dragging, double-click-to-maximise and the `useSystemTitleBar` runtime switch.
- No plugin permissions are declared because no plugins are installed.
- `app.security.csp` is `null`. Set a restrictive policy before release.
- Planned least-privilege policy: grant only the dialog open, directory read and metadata commands the UI actually calls; do not enable shell execution.
- Plugin crates still to add: `tauri-plugin-dialog`, `tauri-plugin-fs` (and `tauri-plugin-shell` only if external launching is genuinely required).

## Window chrome

- `app.windows[0].decorations` is `false`, so the window opens without native chrome and the Svelte `TitleBar` provides the controls.
- Interface settings expose `useSystemTitleBar`. `src/lib/windowChrome.ts` calls `setDecorations(!useSystem)` when the setting changes, and `App.svelte` hides the in-app title bar when native decorations are enabled.
- The runtime toggle depends on `core:window:allow-set-decorations`; removing that permission breaks the setting.

## Migration checklist

| Step | Status |
| --- | --- |
| Upgrade JS packages to `@tauri-apps/api` / `@tauri-apps/cli` v2 | Done |
| Set Rust `tauri` / `tauri-build` to v2 | Done |
| Remove the v1 allowlist feature flags | Done (features are empty) |
| Rewrite `tauri.conf.json` to the v2 schema (`productName`, `version`, `identifier`, `app.windows`, `app.security`, `bundle`, `devUrl`, `frontendDist`) | Done (commit `9d6fa1a`) |
| Replace `get_window` with `get_webview_window` | Done (commit `9d6fa1a`) |
| Point `beforeDevCommand` / `beforeBuildCommand` at bun frontend-only scripts | Done |
| Fix Vite `outDir` to resolve inside the project | Done (commit `b6c72c0`) |
| Add `capabilities/` with least-privilege window permissions | Done (`capabilities/default.json`) |
| Disable native decorations and add the custom/system title bar toggle | Done |
| Install the required v2 plugin crates | Planned |
| Register plugins and an `invoke_handler` | Planned |
| Replace placeholder icons with project branding | Planned |
| Set a Content Security Policy | Planned |
