# Changelog — English Documentation

Dates use `YYYY-MM-DD`. This file records project milestones and documentation changes for the English documentation tree.

## 2026-10-31

### Added — bilingual documentation

- Added [docs/README.md](../README.md), the English documentation landing page: project summary, feature highlights, documentation index, quick-start commands, status labels, tech stack and contributing notes.
- Added [docs/README.as-twi.md](../README.as-twi.md), the Asante Twi translation of the landing page, with the same structure and links back to the English documentation.
- Added shields.io badges for the version, platforms, Tauri, Svelte, TypeScript, Tailwind, Bun, GitHub stars, forks, issues, last commit and docs languages, plus a **Project at a glance** statistics grid.
- Added a **Download** section linking [GitHub Releases](https://github.com/quabynahdavis/vlc-svelte/releases) and a from-source quick start.
- Added a screenshot gallery under `docs/assets/screenshots/`: player, library, music, settings, layout editor, add-to-playlist, compact library and light theme. The VLC cone mark is copied to `docs/assets/vlc.svg`.
- Both READMEs carry a language switcher at the top and bottom: **English** · **Asante Twi**.
- Updated [OVERVIEW.md](OVERVIEW.md) to link the language landing pages, show the new docs tree and clarify that detailed documentation remains English-only while the Asante Twi README is a translated entry point.

### Added — shell and player

- **Consolidated application menu**: the title-bar menu button opens the full menu (playback, video, audio, subtitle, playlist, open media, settings, layout, welcome, quit); right-click opens a shorter playback-focused menu that keeps **Hide UI**.
- **Compact library overlay** in the player, available windowed and fullscreen: search, watched/unwatched filter, sort, progress rows, add-media menu and drag-to-queue. Escape closes it and focus returns to the trigger.
- **Welcome screen** for first-run theme, accent, interface language and library folders, persisted under `vlc.onboarding.v1`; it can be reopened from the menu.
- **Layout editor** in Settings: reorder the navigation rail and right-dock tabs by drag or arrow buttons, toggle secondary player controls, reset to defaults. Persisted under `vlc.layout.v1`.
- **Drag-to-queue** from library cards/rows, music rows and the compact overlay using a shared `application/x-vlc-track` payload; the playlist panel shows a drop hint and appends without interrupting playback.
- **Add-to-playlist** dialog with playlist selection and inline creation, opened from library and music row hover actions. Playlist contents remain session-only; pins persist under `vlc.playlists.pins.v1`.
- **Player-control visibility** now follows the layout store; previous/play/next, elapsed time and the seek bar stay fixed.
- **Right-dock bookmarks/chapters** tab, subtitle timeline and per-show defaults, audio track/output-device selection, video filter previews, music genres and waveform strip, saved network streams, settings profiles and a separate hotkeys window are documented as implemented.

### Changed — documentation

- Updated [design/02-redesign-vision.md](design/02-redesign-vision.md): replaced the stale uncommitted/planned split with implemented tables for the shell, player, media, queue and settings, and a shorter list of genuine gaps (full next-episode countdown, address bar/details view, native scanning/metadata, persistent blob media, playlist drag-reordering, native playback).
- Updated [architecture/02-frontend.md](architecture/02-frontend.md): consolidated menu and welcome/layout/add-to-playlist wiring, compact overlay, music genres, saved streams, sixteen settings categories, new components/stores (`layout`, `onboarding`, `playlistTarget`, `subtitleProfiles`, `bookmarks`, `settingsProfiles`, `avPrefs`, `dragTrack`) and the full persistence-key table.
- Updated [OVERVIEW.md](OVERVIEW.md) for the new shell surfaces and settings count.

### Verified

- `bun run check` reports **0 errors and 0 warnings**.
- `bunx vite build` succeeds and writes `src-tauri/gen/dist/`.

## 2026-10-29

### Added — redesign vision and implementation notes

- Added [design/02-redesign-vision.md](design/02-redesign-vision.md): the target direction for the player, library, music, playlists, network and settings, with separate **Implemented**, **Implemented in the current working tree (uncommitted)** and **Planned — not implemented** sections.
- Documented the uncommitted transport work in `src/components/TransportBar.svelte`: a larger play button, cone-shaped volume control, thicker seek bar with hover thumbnails, and a compact **Next** button in the last 20 seconds.
- `LibraryAddMenu` adds **Add file…**, **Add folder…** and **Add network stream…** actions, with hidden HTML pickers, URL validation, duration probing and a dismissible import-status line.
- Library watched/unwatched filtering, a `watched` sort key and clickable breadcrumb navigation.
- Fullscreen now targets a shell containing the stage and transport, with a top bar for the title, picture-in-picture and exit-fullscreen; chrome auto-hides after 2.5 seconds and returns on pointer/focus/keyboard activity.
- `TransportBar` gains a larger play button, cone volume, a thicker seek bar with hover previews and a compact **Next** button.

### Changed — documentation

- Rewrote [design/01-design-system.md](design/01-design-system.md) around the implemented semantic tokens, dark and warm-neutral light palettes, runtime accent derivation, Tailwind mappings, shape language, icon rules, dark exceptions and current transport specification.
- Rewrote [architecture/01-overview.md](architecture/01-overview.md) and [architecture/02-frontend.md](architecture/02-frontend.md) to match the implemented shell, six views, right dock, fourteen settings categories, library imports, fullscreen/PiP, stores, persistence keys and known gaps.
- Updated [OVERVIEW.md](OVERVIEW.md), [guides/01-setup.md](guides/01-setup.md), [guides/02-design-reference.md](guides/02-design-reference.md) and [architecture/03-tauri-backend.md](architecture/03-tauri-backend.md) for the current scripts, capabilities, decorations setting and design status.

### Changed — UI

- `feat: Use raised surfaces for view interactions` (`2529a37`) — Music, Network, Playlists and Recent rows now use the raised surface token for hover/selection instead of ad-hoc fills.

### Verified

- `bun run check` reports **0 errors and 0 warnings**.
- The documented frontend build output remains `src-tauri/gen/dist/`.

## 2026-10-27

### Added

- Dual-theme token layer with a warm-neutral light palette and `-rgb` companions (`ba54024`).
- Custom-or-system title bar setting, applied to the native window at runtime (`e1d8309`).
- Shared grid/list/compact view-mode control and per-scope view-mode store (`04faa77`).
- Sorting across Library, Music and Playlists, with stable direction-aware comparators (`9c3a30f`).
- Player stage gestures: delayed single click, double-click fullscreen and wheel volume with a HUD (`898ba0b`).
- Tauri v2 window-control capabilities for minimise, maximise, close, dragging and decoration switching (`fe3daec`).
- `svelte-check` script; `dev` now delegates to `dev:tauri`, and `build` to `bunx tauri build` (`22a7137`).

### Changed

- Migrated the shell (`cc1a8df`), settings and dock panels (`9c4449f`), and browse views (`6c1aacb`) from literal colours to semantic tokens.
- Documented the verified frontend build and the Tauri window permissions (`5fd2cc0`).

### Fixed

- Resolved the Svelte compile errors that blocked `vite build` (`7206d11`): component `class:` modifiers, a duplicate `class` attribute, the dynamic input `type`, and the `DEFAULT_HOTKEYS` export.
- Kept transport and `<video>` volume state in sync (`5b40be5`).
- Resolved component event and icon-map type errors (`7b879d3`).
- Repaired the `DropZone` component (`fc599b9`).
- Supported disabled selects and corrected toggle ARIA labels (`6e5ed2e`).
- Normalised persisted accent hex casing (`208f962`).
- Repaired the visualizer mode and right-dock layout (`49824cd`).
- Removed stray Vite timestamp files and ignored test artifacts (`cd59bdf`, `96586d7`).

## 2026-10-26

### Added — application UI

- Initial Tauri + Svelte + Vite + Tailwind scaffold (`f06be1b`): `App.svelte`, `PlayerView.svelte`, `SettingsView.svelte`, Tauri configuration and placeholder icons.
- Design tokens and application shell (`80abc9c`): `TitleBar`, `IconRail`, `ContextMenu`, settings modal scaffold, Tailwind `vlc.*` palette and base styles.
- Library breadcrumb toolbar and responsive media grid (`ac3c088`): `LibraryView`, `LibraryToolbar`, `MediaCard` and the library store.
- Player playlist panel and transport controls (`74a7159`): `PlayerView`, `PlaylistPanel`, a synced `<video>` element, seek/volume/buffered state and `TransportBar`.
- Context menu and property panel (`6f88ab2`).
- Full settings modal with General, Audio and Subtitles panels (`093d82a`).
- Right sidebar for audio, subtitles, video and queue (`f135a89`), then a canvas overlay with per-media tabs (`c3691b4`).
- Music, Network, Recent and Playlists screens (`ed59392`).
- Global fuzzy search (`a8a348f`), audio visualizer (`f934ecf`), settings reset (`3178404`) and JSON export/import (`e5b496d`).
- English locale scaffold and translation helper (`ea7ffdc`).

### Corrected — design tokens

- Replaced the approximate palette with values measured from the PNG exports: accent `#D37918`, pressed/icon dark `#AB6314`, fill start `#371F06`, app `#0E0E0E`, panel `#181818`, panel alt `#191919`, card `#1B1B1B`, raised `#232323`, border `#373737`, border subtle `#262626`, and text `#EAEAEA` / `#B8B8B8` / `#8F8F8F` / `#6B6B6B` (`8c89b45`).
- Recorded the 25 PNGs as the source of truth; the ~30 MB SVG is a collage of the same 21 screen images and adds no vector data.
- Documented the implemented components and their files, and replaced the interim-palette note with the measured token set.

### Added — design system

- Added [design/01-design-system.md](design/01-design-system.md): canonical measured colour, typography, radius, spacing and elevation tokens, plus component specifications and implementation status.
- Documented the source exports in `VLC Redesign (Community)/` by filename, including the 21 screen images and the small frame/disc/icon assets.

### Changed — Tauri v2 migration (complete)

- `src-tauri/tauri.conf.json` now uses the v2 schema: `$schema` `https://schema.tauri.app/config/2`, top-level `productName`, `version`, `identifier` and `bundle`, `build.devUrl`, `build.frontendDist`, `app.windows` and `app.security` (commit `9d6fa1a`).
- `src-tauri/src/main.rs` now resolves the window with `app.get_webview_window("main")` and imports `tauri::Manager`; the v1 `get_window` call is gone.
- `src-tauri/Cargo.toml` uses `tauri = "2"` and `tauri-build = "2"` with empty feature sets; the v1 `dialog-all` / `fs-all` / `shell-all` allowlist features were removed.
- `build.beforeDevCommand` is `bun run dev:frontend`; `build.beforeBuildCommand` is `bun x vite build`. Tauri no longer re-enters itself through the npm scripts.
- The JavaScript packages were already on `@tauri-apps/api` and `@tauri-apps/cli` `^2.0.0`.

### Fixed — frontend build

- Fixed the Vite output path in commit `b6c72c0`: `build.outDir` changed from `../src-tauri/gen/dist` to `src-tauri/gen/dist`, so the bundle is written inside the project at `src-tauri/gen/dist/` and matches `build.frontendDist` (`gen/dist`, resolved relative to `src-tauri/`).
- Resolved the frontend build issue in `src/views/SettingsView.svelte` (commit `da32cfd`, "fix: resolve build issues").

### Documentation cleanup

- docs cleanup: French removed, English-only structure. `docs/fr/` and every French mirror link are gone; `docs/en/` is the sole language root with `OVERVIEW.md` and `CHANGELOG.md`.
- Deleted the redundant root-level `docs/OVERVIEW.md` and `docs/CHANGELOG.md`; the required pair now lives only at the language root, `docs/en/`.
- Deleted the duplicate `OVERVIEW.md` / `CHANGELOG.md` files from `docs/en/architecture/` and `docs/en/guides/`. Domain folders contain only numbered topic documents.

## Known gaps

- Tauri native integration is partial: window capabilities and custom/system decorations exist, but there are no plugin crates, `invoke_handler`, native file dialogs or media-metadata commands, and `app.security.csp` is `null`.
- Library, music, playlist, recent and network data are mock data; mock items use the bundled `public/demo/sample.mp4`, while imported files/streams are session-only and recent/network selections are inert.
- There is no URL router; navigation, settings visibility, the property dock and hidden chrome are in-memory and reset on reload.
- Settings and view modes persist; the player queue does not.
- The full next-episode prompt, subtitle timeline, audio output-device selection, video filter previews, saved network streams, editable address bar, details view and library empty-state add actions are planned, not implemented. Picture-in-picture, fullscreen chrome auto-hide, watched filtering and library imports exist in the working tree but are uncommitted.
- `src-tauri/icons/` still contains default Tauri placeholder icons; Inter is loaded from Google Fonts rather than self-hosted; true two-tone menu glyphs are not rendered.
- No automated test suite is configured.
