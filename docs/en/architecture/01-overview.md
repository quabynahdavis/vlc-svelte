# Architecture Overview

**Status:** UI shell, six browse views, player, right dock, settings and local persistence are implemented. Tauri v2 configuration, window capabilities and the native backend (SQLite persistence, disk scanning, ffmpeg thumbnails, audio metadata/cover art, waveform peaks, dialog plugin, runtime asset scope) are in place. **Waveform seekbar for audio playback** and **real AnalyserNode dock visualizer** are implemented. Last updated 2026-11-12.

## Purpose

Kanea is a community redesign that rebuilds the VLC desktop player UI as a web-technology desktop application. Svelte renders the interface inside a Tauri window; Rust supplies the native shell, SQLite persistence, disk scanning, thumbnails and audio metadata/cover-art access. The application plays a bundled demo clip for mock items, can import local files/folders and stream URLs for the current session, and browses real disk-scanned data — the Videos library tree and the Music page both read the configured roots through the library and music library stores, while playlist and network content stays mock; persistent media integration is still in progress.

## Tech stack

Versions are taken from `package.json` and `src-tauri/Cargo.toml`.

| Layer | Technology | Version | Role | Status |
| --- | --- | --- | --- | --- |
| Desktop shell | Tauri | Rust `tauri = "2"`, JS API/CLI `^2.0.0` | Native window, bundling, future OS integration | Implemented — v2 config, webview API, window capabilities and ten registered commands (`tauri-plugin-dialog`) |
| UI framework | Svelte | `^4.2.19` | Components and reactivity | Implemented |
| Language | TypeScript | `^5.7.2` | Typed frontend code | Implemented |
| Build tool / dev server | Vite | `^5.4.11` | Dev server on port 5173, production bundle | Implemented |
| CSS framework | Tailwind CSS | `^3.4.17` | Utility-first styling over semantic CSS variables | Implemented |
| CSS pipeline | PostCSS + Autoprefixer | `^8.4.49` / `^10.4.20` | Tailwind processing and vendor prefixes | Implemented |
| Svelte preprocessing | svelte-preprocess | `^6.0.5` | TypeScript inside `.svelte` files | Implemented |
| Icons | lucide-svelte | `^0.460.0` | Line icons across the shell, views and dock | Implemented |
| Routing | svelte-routing | `^2.6.0` | URL-based routing | **Planned** — dependency installed, not used |
| Package manager | bun | `bun.lock` present | Install, scripts, lockfile | Implemented |
| Rust edition | Rust | edition 2021 | Tauri backend | Implemented |

The project uses **bun**; do not generate or commit `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`.

## Repository layout

```
vlc/
├── bun.lock
├── index.html                 # Vite entry, pre-paint theme script, mounts #app
├── package.json               # scripts and dependencies
├── postcss.config.js          # tailwindcss + autoprefixer
├── tailwind.config.js         # vlc.* tokens mapped to CSS variables
├── tsconfig.json              # strict TS, noEmit, bundler resolution
├── vite.config.ts             # Svelte + TS preprocess, outDir src-tauri/gen/dist
├── public/
│   ├── demo/sample.mp4        # bundled demo clip used by mock items
│   └── vlc.svg
├── src/
│   ├── App.svelte             # shell: title bar, rail, views, dock, overlays
│   ├── app.css                # Tailwind directives, dark/light token palettes
│   ├── main.ts                # mounts App, applies appearance
│   ├── components/            # shell, player, library, dock, settings, property
│   ├── i18n/en.json           # English strings for t()
│   ├── lib/                   # constants, mock data, theme, persistence, gestures
│   ├── stores/                # player, library, music, playlists, recent, network, settings, UI
│   └── views/
│       ├── PlayerView.svelte
│       ├── LibraryView.svelte
│       ├── MusicView.svelte
│       ├── PlaylistsView.svelte
│       ├── RecentView.svelte
│       ├── NetworkView.svelte
│       └── SettingsView.svelte # legacy scaffold, not mounted
├── src-tauri/
│   ├── build.rs               # tauri_build::build()
│   ├── Cargo.toml             # tauri 2, tauri-build 2
│   ├── capabilities/default.json # window control permissions
│   ├── icons/                 # placeholder Tauri icons
│   ├── src/main.rs            # Tauri v2 builder and webview window setup
│   └── tauri.conf.json        # Tauri v2 schema, decorations off
├── docs/                      # this documentation (English tree under en/)
└── VLC Redesign (Community)/  # design references: 25 PNGs + 1 SVG
```

Build output, not source: `src-tauri/gen/dist/` (Vite output, gitignored) and `src-tauri/target/` (Rust artifacts, gitignored).

## Architecture

```
┌────────────────────────────────────────────────┐
│ Tauri window (1200 × 800, decorations off)     │
│ ┌────────────────────────────────────────────┐ │
│ │ Svelte UI                                  │ │
│ │  App.svelte                                │ │
│ │   ├─ TitleBar / IconRail                   │ │
│ │   ├─ PlayerView ─ RightDock + TransportBar │ │
│ │   └─ Library / Music / Playlists /         │ │
│ │      Recent / Network views                │ │
│ │  stores/, lib/, components/                │ │
│ └──────────────────┬─────────────────────────┘ │
│                    │ invoke()                  │
│ ┌──────────────────▼─────────────────────────┐ │
│ │ Rust commands — registered                 │ │
│ │  db · scanner · thumbnails · audio meta    │ │
│ │  cover art · asset scope · dialog plugin   │ │
│ └──────────────────┬─────────────────────────┘ │
│                    │                           │
│         OS file system / dialogs               │
└────────────────────────────────────────────────┘
```

The Svelte UI and the Tauri v2 shell are implemented, including ten registered Tauri commands: `db_get`/`db_set` (SQLite), `scan_library_dir`/`default_media_dir` (disk scanning), `thumb_get`/`thumb_generate` (ffmpeg frames), `read_audio_metadata`/`cover_get`/`cover_extract` (lofty metadata/artwork) and `scope_assets` (runtime asset scope). Window actions also use the JavaScript window API directly, backed by `src-tauri/capabilities/default.json`.

## Design goals

1. **Reference-faithful desktop player.** Reproduce the player chrome, transport strip, context menu, subtitle settings, settings modal and effect panels shown in the design exports.
2. **Dual-theme, token-driven UI.** Dark and warm-neutral light palettes share one semantic token set (`src/app.css`); the accent is user-configurable and applied at runtime. Tokens and rules live in [../design/01-design-system.md](../design/01-design-system.md).
3. **Custom controls over native video.** Replace the browser's native controls with the designed transport while keeping playback accessible and keyboard-operable.
4. **Local media via Tauri.** Open files/folders through the native dialog and read them through registered Rust commands: disk scanning, SQLite persistence, ffmpeg thumbnails and lofty metadata/cover art (implemented; see [03-tauri-backend.md](03-tauri-backend.md)).
5. **Componentized, typed UI.** Compose the shell and screens from small Svelte components and typed stores (implemented; see [02-frontend.md](02-frontend.md)).
6. **Accessible and keyboard-friendly.** Icon buttons have labels and focus states; the player has keyboard shortcuts; complete shortcut coverage and ARIA patterns remain in progress.

## Current status at a glance

| Area | State |
| --- | --- |
| Vite + Svelte + Tailwind frontend | Implemented; `bun run check` passes; `bun run dev:frontend` serves the browser build |
| Player screen | Implemented: playlist panel, synced `<video>`, stage gestures, fullscreen shell with auto-hiding chrome and PiP (working tree), right dock, transport, demo and imported playback, **waveform seekbar for audio**, **real AnalyserNode visualizer** |
| Library screen | Implemented: breadcrumb toolbar, search, watched filter, sorting, grid/list/compact, add file/folder/stream (working tree); selecting an item queues it and opens the player |
| Music, Playlists, Recent, Network | Implemented browse screens with sorting and/or view modes; Music renders the real music library store (`Artists / Albums / Songs / Genres / Folders`), recent rows render the persisted history store, while playlist and network content is mock and network and recent-Devices selections are inert |
| Settings | Sixteen categories implemented, including Layout and Profiles; persistence, reset and JSON import/export |
| Tauri v2 shell | Implemented; v2 config, `main.rs`, window capabilities and custom/system decorations |
| Native plugins, commands, metadata | Implemented (`tauri-plugin-dialog` plus thirteen registered commands) |
| Native file dialogs, directory listing, persistent media sources | Implemented: native folder dialog, SQLite-backed persistence and Rust disk scanning; native playback itself is still planned |
| Tests | Rust unit tests only (`cargo test`, 41 passing: asset scope, scanner, database, thumbnails, audio metadata, waveform); no frontend test suite — type checking runs through `bun run check` |
