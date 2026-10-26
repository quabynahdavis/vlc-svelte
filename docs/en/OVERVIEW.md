# VLC Redesign (Community) — Documentation

**Language:** English only.

## Project summary

VLC Redesign (Community) is a desktop media-player UI rebuilt as a **Tauri v2 + Svelte 4 + TypeScript + Tailwind CSS** application, with **bun** as the package manager. The frontend implements the dark application shell (title bar, icon rail, playlist panel, transport bar, library grid, settings modal, context menu and property dock); media/library wiring, the remaining settings panes and Tauri commands are still in progress. The Tauri backend uses the v2 configuration schema and webview API (commit `9d6fa1a`); native plugins, capabilities and commands are planned.

The design reference exports (26 files: 25 PNGs + 1 SVG) live in the repository-root folder `VLC Redesign (Community)/`. The 25 PNGs are the visual source of truth; the SVG is a collage of the same 21 screen images, not extra vector data. Canonical design tokens are documented in [design/01-design-system.md](design/01-design-system.md); the full export inventory is in [guides/02-design-reference.md](guides/02-design-reference.md).

## Documentation index

| Document | Description |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | Revision history of the English documentation and project milestones. |
| [architecture/01-overview.md](architecture/01-overview.md) | Tech stack, repository layout, architecture and design goals. |
| [architecture/02-frontend.md](architecture/02-frontend.md) | Svelte app structure, implemented components, stores, views and styling conventions. |
| [architecture/03-tauri-backend.md](architecture/03-tauri-backend.md) | Tauri v2 configuration, Rust entry point, icons, planned commands and permissions. |
| [design/01-design-system.md](design/01-design-system.md) | Canonical measured colour, typography, radius and component tokens extracted from the PNG exports. |
| [guides/01-setup.md](guides/01-setup.md) | Prerequisites, installation, development, build, troubleshooting. |
| [guides/02-design-reference.md](guides/02-design-reference.md) | Inventory of the 26 design exports and how to use them as an implementation spec. |

## Documentation layout

```
docs/
└── en/
    ├── OVERVIEW.md
    ├── CHANGELOG.md
    ├── architecture/
    │   ├── 01-overview.md
    │   ├── 02-frontend.md
    │   └── 03-tauri-backend.md
    ├── design/
    │   └── 01-design-system.md
    └── guides/
        ├── 01-setup.md
        └── 02-design-reference.md
```

## Status labels

| Label | Meaning |
| --- | --- |
| **Implemented** | Present and wired in `src/` or `src-tauri/`. |
| **In progress** | Partially present; known gaps are called out in the relevant document. |
| **Planned** | Not implemented yet; described only as a target. |

## Documentation conventions

- The documentation is **English-only**, with no translated mirrors.
- `/docs/en/` is the language root and holds the only required `OVERVIEW.md` / `CHANGELOG.md` pair.
- Domain folders (`architecture/`, `design/`, `guides/`) contain numbered topic documents only; they do not duplicate domain-level overview or changelog files.
- Topic files use sequential prefixes (`01-`, `02-`, ...).
- Paths, commands and code identifiers stay in English.
- Design values come from the PNG exports; the canonical list lives in [design/01-design-system.md](design/01-design-system.md). Do not invent alternate hex values in component docs.
