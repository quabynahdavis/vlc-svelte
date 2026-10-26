# Architecture Overview

**Status:** UI shell and core components implemented; the Tauri v2 migration is complete for configuration and the webview API; media integration, remaining settings panes and persistence are in progress or planned. Last updated 2026-10-26.

## Purpose

The project rebuilds the VLC desktop player UI as a web-technology desktop application. Svelte renders the interface inside a Tauri window; Rust supplies the native shell and, later, local file-system and media metadata access. The dark application shell and core screens are implemented; media playback and library wiring are still in progress.

## Tech stack

Versions are taken from `package.json` and `src-tauri/Cargo.toml`.

| Layer | Technology | Version | Role | Status |
| --- | --- | --- | --- | --- |
| Desktop shell | Tauri | Rust `tauri = "2"`, JS API/CLI `^2.0.0` | Native window, bundling, future OS integration | Implemented — v2 config and webview API migrated (commit `9d6fa1a`); plugins/commands planned |
| UI framework | Svelte | `^4.2.19` | Components and reactivity | Implemented |
| Language | TypeScript | `^5.7.2` | Typed frontend code | Implemented |
| Build tool / dev server | Vite | `^5.4.11` | Dev server on port 5173, production bundle | Implemented |
| CSS framework | Tailwind CSS | `^3.4.17` | Utility-first styling | Implemented |
| CSS pipeline | PostCSS + Autoprefixer | `^8.4.49` / `^10.4.20` | Tailwind processing and vendor prefixes | Implemented |
| Svelte preprocessing | svelte-preprocess | `^6.0.5` | TypeScript inside `.svelte` files | Implemented |
| Icons | lucide-svelte | `^0.460.0` | Icon components | Implemented (used in `PlayerView`) |
| Routing | svelte-routing | `^2.6.0` | URL-based routing | **Planned** — dependency installed, not used |
| Package manager | bun | `bun.lock` present | Install, scripts, lockfile | Implemented |
| Rust edition | Rust | edition 2021 | Tauri backend | Implemented |

The project uses **bun**; do not generate or commit `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`.

## Repository layout

```
vlc/
├── bun.lock
├── index.html                 # Vite HTML entry, mounts #app
├── package.json               # scripts and dependencies
├── postcss.config.js          # tailwindcss + autoprefixer
├── tailwind.config.js         # vlc.* palette (interim values), radii, Inter stack
├── tsconfig.json              # strict TS, noEmit, bundler resolution
├── vite.config.ts             # Svelte + TS preprocess, outDir src-tauri/gen/dist
├── src/
│   ├── App.svelte             # shell: title bar, rail, views, overlays
│   ├── app.css                # Tailwind directives, base layout, dark theme
│   ├── main.ts                # mounts App into #app
│   ├── components/            # shell, player, library, menu, settings, property
│   ├── lib/                   # nav constants and demo media data
│   ├── stores/                # player, library, settings, UI state
│   └── views/
│       ├── PlayerView.svelte  # video stage, playlist and transport
│       ├── LibraryView.svelte # breadcrumb toolbar and media grid
│       └── SettingsView.svelte# legacy scaffold, not mounted
├── src-tauri/
│   ├── build.rs               # tauri_build::build()
│   ├── Cargo.toml             # tauri 2, tauri-build 2
│   ├── icons/                 # 6 placeholder Tauri icons
│   ├── src/main.rs            # Tauri v2 builder and webview window setup
│   └── tauri.conf.json        # Tauri v2 schema
├── docs/                      # this documentation (English tree under en/)
└── VLC Redesign (Community)/  # design references: 25 PNGs + 1 SVG
```

Build output, not source: `src-tauri/gen/dist/` (Vite output, gitignored) and `src-tauri/target/` (Rust artifacts, gitignored).

## Architecture

```
┌──────────────────────────────────────────────┐
│ Tauri window (1200 × 800, resizable)         │
│ ┌──────────────────────────────────────────┐ │
│ │ Svelte UI                                │ │
│ │  App.svelte → PlayerView / LibraryView   │ │
│ │  components/, stores/, lib/ implemented  │ │
│ └──────────────────┬───────────────────────┘ │
│                    │ invoke() — planned      │
│ ┌──────────────────▼───────────────────────┐ │
│ │ Rust commands — planned                  │ │
│ │  dialog · directory listing · metadata   │ │
│ └──────────────────┬───────────────────────┘ │
│                    │                         │
│         OS file system / dialogs             │
└──────────────────────────────────────────────┘
```

Only the Svelte UI layer and the Tauri v2 shell are implemented. No Tauri commands are registered yet; window actions use the JavaScript window API directly.

## Design goals

1. **Reference-faithful desktop player.** Reproduce the player chrome, bottom control strip, context menu, subtitle settings, settings modal, and effect panels shown in the design exports.
2. **Dark-first shell.** Near-black application surface (`#0E0E0E`), panel (`#181818`), panel alt (`#191919`), card (`#1B1B1B`) and raised (`#232323`) surfaces, `#EAEAEA`/`#B8B8B8`/`#8F8F8F`/`#6B6B6B` text, and the VLC orange accent (`#D37918`, pressed `#AB6314`, fill start `#371F06`). Tokens are defined in [../design/01-design-system.md](../design/01-design-system.md); purple, pink and blue accent variants exist in the references.
3. **Custom controls over native video.** Replace the browser's native controls with the designed control bar while keeping playback accessible.
4. **Local media via Tauri.** Open files/folders and read media metadata through Rust commands (planned; none exist yet).
5. **Componentized, typed UI.** Compose the shell and screens from small Svelte components and typed stores (implemented; see [02-frontend.md](02-frontend.md)).
6. **Accessible and keyboard-friendly.** Icon buttons have labels and focus states; complete keyboard shortcuts and ARIA patterns remain planned.

## Current status at a glance

| Area | State |
| --- | --- |
| Vite + Svelte + Tailwind frontend | Implemented; renders in a browser and can be started with `bun run dev:frontend` |
| Player screen | Implemented shell: playlist panel, synced `<video>` and transport bar; no startup media or queue wiring |
| Library screen | Implemented breadcrumb toolbar, search and media grid; card selection not wired |
| Settings | Settings modal with General, Audio and Subtitles panes; ten categories are placeholders; no persistence |
| Tauri v2 shell | Implemented; `tauri.conf.json` and `main.rs` use the v2 schema and API, so the desktop window builds |
| Native plugins, capabilities, commands | Planned |
| File dialogs, directory listing, metadata | Planned |
| Context menu, subtitles UI, effect panels, equalizer | Implemented context menu, subtitles pane and effect panel; equalizer UI present in Audio settings |
