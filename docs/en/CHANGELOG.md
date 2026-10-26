# Changelog — English Documentation

Dates use `YYYY-MM-DD`. This file records project milestones and documentation changes for the English documentation tree.

## 2026-10-26

### Added — design system

- Added [design/01-design-system.md](design/01-design-system.md): canonical colour, typography, radius, spacing and elevation tokens, plus the observed components (icon rail, transport bar, settings modal, context menu, toggle switch, sliders, tab bar, segmented control, accent swatches and property slider rows).
- Cited the source exports in `VLC Redesign (Community)/` by filename and recorded the palette: app `#0B0B0B`, sidebar `#111111`, cards `#1A1A1A`, raised `#232323`, accent `#F08A1C`, amber gradient `#A85A0F → #F08A1C`, text `#FFFFFF` / `#B8B8B8` / `#7A7A7A`, border `#262626`, radii 12/8/6 px and Inter.

### Added — documentation

- Created the English documentation tree under `/docs/en/` with `architecture/`, `design/` and `guides/` domains.
- Added architecture documents (stack, frontend, Tauri backend), guides (setup, design reference) and the design-system reference.
- Recorded the design-asset inventory: 25 PNGs + 1 SVG in `VLC Redesign (Community)/`.

### Changed — Tauri v2 migration (complete)

- `src-tauri/tauri.conf.json` now uses the v2 schema: `$schema` `https://schema.tauri.app/config/2`, top-level `productName`, `version`, `identifier` and `bundle`, `build.devUrl`, `build.frontendDist`, `app.windows` and `app.security` (commit `9d6fa1a`).
- `src-tauri/src/main.rs` now resolves the window with `app.get_webview_window("main")` and imports `tauri::Manager`; the v1 `get_window` call is gone.
- `src-tauri/Cargo.toml` uses `tauri = "2"` and `tauri-build = "2"` with empty feature sets; the v1 `dialog-all` / `fs-all` / `shell-all` allowlist features were removed.
- `build.beforeDevCommand` is `bun run dev:frontend`; `build.beforeBuildCommand` is `bun x vite build`. Tauri no longer re-enters itself through the npm scripts.
- The JavaScript packages were already on `@tauri-apps/api` and `@tauri-apps/cli` `^2.0.0`.

### Fixed — frontend build

- Fixed the Vite output path in commit `b6c72c0`: `build.outDir` changed from `../src-tauri/gen/dist` to `src-tauri/gen/dist`, so the bundle is written inside the project at `src-tauri/gen/dist/` and matches `build.frontendDist` (`gen/dist`, resolved relative to `src-tauri/`).
- Resolved the frontend build issue in `src/views/SettingsView.svelte` (commit `da32cfd`, "fix: resolve build issues").

### Removed — documentation

- Cancelled the French documentation. Deleted the entire `docs/fr/` tree and every French mirror link.
- Deleted the redundant root-level `docs/OVERVIEW.md` and `docs/CHANGELOG.md`; the required pair now lives only at the language root, `docs/en/`.
- Deleted the duplicate `OVERVIEW.md` / `CHANGELOG.md` files from `docs/en/architecture/` and `docs/en/guides/`. Domain folders now contain only numbered topic documents.

### Added — scaffold

- Initial Tauri + Svelte + Vite + Tailwind scaffold (commit `f06be1b`): `App.svelte`, `PlayerView.svelte`, `SettingsView.svelte`, Tauri configuration and placeholder icons.

### Known gaps

- Tauri v2 runtime integration is incomplete: no plugins, no `invoke_handler`, no `src-tauri/capabilities/` and no Content Security Policy.
- `src-tauri/icons/` still contains the default Tauri placeholder icons.
- `bun run dev` starts Vite twice (directly and through Tauri's `beforeDevCommand`), which conflicts with `strictPort: true`; use `bun run dev:tauri` instead.
- `bun run build` runs `vite build` and then `tauri build`, whose `beforeBuildCommand` runs Vite again; the frontend is built twice.
