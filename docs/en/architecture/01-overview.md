# Architecture Overview

**Status:** scaffold implemented; the Tauri v2 migration is complete for configuration and the webview API; most UI features are in progress or planned. Last updated 2026-10-26.

## Purpose

The project rebuilds the VLC desktop player UI as a web-technology desktop application. Svelte renders the interface inside a Tauri window; Rust supplies the native shell and, later, local file-system and media metadata access. The current code is a visual scaffold, not a functional media player.

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
├── tailwind.config.js         # content globs; theme.extend empty
├── tsconfig.json              # strict TS, noEmit, bundler resolution
├── vite.config.ts             # Svelte + TS preprocess, outDir src-tauri/gen/dist
├── src/
│   ├── App.svelte             # shell: nav + view switching
│   ├── app.css                # Tailwind directives + body font
│   ├── main.ts                # mounts App into #app
│   └── views/
│       ├── PlayerView.svelte  # HTML5 video + custom control bar
│       └── SettingsView.svelte# static settings controls
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
│ │  App.svelte → PlayerView / SettingsView  │ │
│ │  planned: components/, stores/, lib/     │ │
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

Only the Svelte UI layer and the Tauri v2 shell are implemented. The `invoke` import in `App.svelte` is an unused placeholder; no Tauri commands are registered yet.

## Design goals

1. **Reference-faithful desktop player.** Reproduce the player chrome, bottom control strip, context menu, subtitle settings, settings modal, and effect panels shown in the design exports.
2. **Dark-first shell.** Near-black application surface (`#0B0B0B`), sidebar (`#111111`), card (`#1A1A1A`) and raised (`#232323`) surfaces, white/secondary/muted text, and the VLC orange accent (`#F08A1C`) with amber gradient fills. Tokens are defined in [../design/01-design-system.md](../design/01-design-system.md); purple, pink and blue accent variants exist in the references.
3. **Custom controls over native video.** Replace the browser's native controls with the designed control bar while keeping playback accessible.
4. **Local media via Tauri.** Open files/folders and read media metadata through Rust commands (planned; none exist yet).
5. **Componentized, typed UI.** Split the two monolithic views into small Svelte components and typed stores (planned).
6. **Accessible and keyboard-friendly.** Icon buttons need labels, focus states and shortcuts matching the reference menu (planned).

## Current status at a glance

| Area | State |
| --- | --- |
| Vite + Svelte + Tailwind frontend | Implemented; renders in a browser and can be started with `bun run dev:frontend` |
| Player screen | Implemented as a static scaffold; playback state is not wired to the video element |
| Settings screen | Implemented as static controls; no persistence |
| Tauri v2 shell | Implemented; `tauri.conf.json` and `main.rs` use the v2 schema and API, so the desktop window builds |
| Native plugins, capabilities, commands | Planned |
| File dialogs, directory listing, metadata | Planned |
| Context menu, subtitles UI, effect panels, equalizer | Planned |
