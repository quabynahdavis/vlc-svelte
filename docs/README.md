# VLC Redesign (Community)

**Read this in:** **English** · [Asante Twi](README.as-twi.md)

VLC Redesign (Community) is a community-built desktop interface for VLC Media Player. It keeps the orange VLC cone and accent on neutral gray surfaces, with softened rectangular corners, a dual dark/light theme and a configurable accent. The app is built with **Tauri v2 + Svelte 4 + TypeScript + Tailwind CSS** and managed with **bun**.

## Highlights

- **Player** — previous / play / next on the left; settings, fullscreen, queue, audio and subtitles on the right. Cone-shaped volume, a thick seek bar with hover thumbnails, and a next-episode prompt.
- **Fullscreen** — auto-hiding top and bottom chrome that returns on hover, picture-in-picture, a library drawer and a transport overlay.
- **Library** — breadcrumbs, search, watched/unwatched filtering, sorting, grid/list/details, add file/folder/stream, and drag-to-queue.
- **Music** — Songs, Albums, Artists and Genres, with large cover art and an optional waveform strip.
- **Queue and playlists** — kept distinct, with create, pin, add-to-playlist and drag-to-queue flows.
- **Network** — saved streams with add, edit, play and remove actions.
- **Sidebar** — subtitle timeline, audio track and output device, video filters, playback controls, bookmarks and chapters.
- **Settings** — sixteen categories, profiles, a separate hotkeys window, human-readable subtitle matching and a drag-and-drop layout editor.
- **Onboarding** — a first-run welcome screen for theme, accent, language and library folders.

## Documentation

The canonical documentation is written in English under [`docs/en/`](en/OVERVIEW.md). Start with [OVERVIEW.md](en/OVERVIEW.md), then use the index below.

| Document | Description |
| --- | --- |
| [en/OVERVIEW.md](en/OVERVIEW.md) | Project summary, documentation index and conventions. |
| [en/architecture/01-overview.md](en/architecture/01-overview.md) | Tech stack, repository layout, architecture and design goals. |
| [en/architecture/02-frontend.md](en/architecture/02-frontend.md) | Svelte app structure, components, stores, views, persistence keys and styling conventions. |
| [en/architecture/03-tauri-backend.md](en/architecture/03-tauri-backend.md) | Tauri v2 configuration, Rust entry point, capabilities and planned commands. |
| [en/design/01-design-system.md](en/design/01-design-system.md) | Canonical colour, typography, radius and component tokens for both themes. |
| [en/design/02-redesign-vision.md](en/design/02-redesign-vision.md) | Target direction, with implemented, in-progress and planned items separated. |
| [en/guides/01-setup.md](en/guides/01-setup.md) | Prerequisites, installation, development, build and troubleshooting. |
| [en/guides/02-design-reference.md](en/guides/02-design-reference.md) | Inventory of the 26 design exports and how to use them as a spec. |
| [en/CHANGELOG.md](en/CHANGELOG.md) | Project milestones and documentation revisions. |

An Asante Twi translation of this README is available at [README.as-twi.md](README.as-twi.md). Detailed documentation is maintained in English.

## Getting started

```bash
bun install
bun run dev
```

- Browser-only frontend: `bun run dev:frontend`
- Type-check: `bun run check`
- Production build: `bun run build`

See [en/guides/01-setup.md](en/guides/01-setup.md) for system packages and the full script reference.

## Documentation layout

```
docs/
├── README.md            # English documentation landing page
├── README.as-twi.md     # Asante Twi translation
└── en/
    ├── OVERVIEW.md
    ├── CHANGELOG.md
    ├── architecture/
    ├── design/
    └── guides/
```

## Status labels

| Label | Meaning |
| --- | --- |
| **Implemented** | Present and wired in `src/` or `src-tauri/`. |
| **In progress** | Partially present; known gaps are called out in the relevant document. |
| **Planned** | Not implemented yet; described only as a target. |

## Notes

- Library, music, playlist and network data are mock data.
- Imported media and playlist tracks with `blob:` sources are session-only. Pins, saved streams, subtitle profiles, bookmarks, layout and onboarding persist across reloads.
- The 26 design exports (25 PNGs + 1 SVG) live in the repository-root folder `VLC Redesign (Community)/`. The PNGs are the visual source of truth.

---

**Languages:** **English** · [Asante Twi](README.as-twi.md)
