# Changelog — English Documentation

Dates use `YYYY-MM-DD`. This file records project milestones and documentation changes for the English documentation tree.

## 2026-10-27

### Fixed — frontend build

- `fix(build): resolve Svelte compile errors blocking vite build` (`fb04100`) — `bunx vite build` now completes. Svelte rejects `class:` modifiers on components, so every lucide `ChevronDown`/`ChevronUp` is now wrapped in a `<span>` that carries the transform class; `src/components/settings/Section.svelte` had a duplicate `class` attribute (removed); `src/components/settings/TextInput.svelte` branches password vs text input because Svelte forbids a dynamic `type` on a `bind:` input; and `DEFAULT_HOTKEYS` is now exported from `src/stores/settings.ts` so `ControlsPanel.svelte` can import it.

## 2026-10-26

### Implemented — UI phases

- `feat(ui): design tokens and application shell` (`80abc9c`) — dark application shell with `TitleBar`, `IconRail`, `ContextMenu`, settings modal scaffold, context-menu actions, Tailwind `vlc.*` palette and base styles.
- `feat(library): breadcrumb toolbar and media grid` (`ac3c088`) — `LibraryView`, `LibraryToolbar` (breadcrumb, count, search) and a responsive `MediaCard` grid backed by the library store.
- `feat(player): playlist panel and transport controls` (`74a7159`) — `PlayerView` with `PlaylistPanel`, a synced `<video>` element, seek/volume/buffered state and the `TransportBar` controls.

### Corrected — design tokens

- Replaced the approximate palette with values measured from the PNG exports: accent `#D37918`, pressed/icon dark `#AB6314`, fill start `#371F06`, app `#0E0E0E`, panel `#181818`, panel alt `#191919`, card `#1B1B1B`, raised `#232323`, border `#373737`, border subtle `#262626`, and text `#EAEAEA` / `#B8B8B8` / `#8F8F8F` / `#6B6B6B`.
- Recorded the 25 PNGs as the source of truth; the ~30 MB SVG is a collage of the same 21 screen images and adds no vector data.
- Documented the implemented components (`TitleBar`, `IconRail`, `PlaylistPanel`, `TransportBar`, `MediaCard`, `LibraryToolbar`, `SettingsModal`, `ContextMenu`, `PropertyPanel` / `PropertySlider`) and their files.
- Marked `tailwind.config.js` as interim; the target values and required config changes are listed in the design system document.

### Added — design system

- Added [design/01-design-system.md](design/01-design-system.md): canonical measured colour, typography, radius, spacing and elevation tokens, plus component specifications and implementation status.
- Documented the source exports in `VLC Redesign (Community)/` by filename, including the 21 screen images and the small frame/disc/icon assets.

### Documentation cleanup

- docs cleanup: French removed, English-only structure. `docs/fr/` and every French mirror link are gone; `docs/en/` is the sole language root with `OVERVIEW.md` and `CHANGELOG.md`.
- Deleted the redundant root-level `docs/OVERVIEW.md` and `docs/CHANGELOG.md`; the required pair now lives only at the language root, `docs/en/`.
- Deleted the duplicate `OVERVIEW.md` / `CHANGELOG.md` files from `docs/en/architecture/` and `docs/en/guides/`. Domain folders contain only numbered topic documents.

### Changed — Tauri v2 migration (complete)

- `src-tauri/tauri.conf.json` now uses the v2 schema: `$schema` `https://schema.tauri.app/config/2`, top-level `productName`, `version`, `identifier` and `bundle`, `build.devUrl`, `build.frontendDist`, `app.windows` and `app.security` (commit `9d6fa1a`).
- `src-tauri/src/main.rs` now resolves the window with `app.get_webview_window("main")` and imports `tauri::Manager`; the v1 `get_window` call is gone.
- `src-tauri/Cargo.toml` uses `tauri = "2"` and `tauri-build = "2"` with empty feature sets; the v1 `dialog-all` / `fs-all` / `shell-all` allowlist features were removed.
- `build.beforeDevCommand` is `bun run dev:frontend`; `build.beforeBuildCommand` is `bun x vite build`. Tauri no longer re-enters itself through the npm scripts.
- The JavaScript packages were already on `@tauri-apps/api` and `@tauri-apps/cli` `^2.0.0`.

### Fixed — frontend build

- Fixed the Vite output path in commit `b6c72c0`: `build.outDir` changed from `../src-tauri/gen/dist` to `src-tauri/gen/dist`, so the bundle is written inside the project at `src-tauri/gen/dist/` and matches `build.frontendDist` (`gen/dist`, resolved relative to `src-tauri/`).
- Resolved the frontend build issue in `src/views/SettingsView.svelte` (commit `da32cfd`, "fix: resolve build issues").

### Added — scaffold

- Initial Tauri + Svelte + Vite + Tailwind scaffold (commit `f06be1b`): `App.svelte`, `PlayerView.svelte`, `SettingsView.svelte`, Tauri configuration and placeholder icons.

### Known gaps

- Tauri v2 runtime integration is incomplete: no plugins, no `invoke_handler`, no `src-tauri/capabilities/` and no Content Security Policy.
- `src-tauri/icons/` still contains the default Tauri placeholder icons.
- `bun run dev` starts Vite twice (directly and through Tauri's `beforeDevCommand`), which conflicts with `strictPort: true`; use `bun run dev:tauri` instead.
- `bun run build` runs `vite build` and then `tauri build`, whose `beforeBuildCommand` runs Vite again; the frontend is built twice.
- `tailwind.config.js` still uses the interim palette; several components also contain literal hex values. The fidelity pass must align both with the measured tokens.
- Ten settings categories render `PlaceholderPanel`; only General, Audio and Subtitles are implemented.
