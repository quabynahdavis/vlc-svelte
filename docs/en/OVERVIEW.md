# Kanea — Documentation

**Language:** English · [Asante Twi README](../README.as-twi.md)

Detailed documentation is maintained in English. The bilingual landing pages are [README.md](../README.md) (English) and [README.as-twi.md](../README.as-twi.md) (Asante Twi).

## Project summary

Kanea — the Twi word for light — is a community-built desktop interface for VLC Media Player, rebuilt as a **Tauri v2 + Svelte 4 + TypeScript + Tailwind CSS** application, with **bun** as the package manager. The frontend implements the application shell (custom title bar, consolidated menu, icon rail, playlist panel, transport bar, right dock, context menu and property panel), six browse views (Player, Library, Music, Playlists, Recent, Network), a sixteen-category settings modal, a separate hotkeys window, a first-run welcome screen, a drag-and-drop layout editor, dual dark/light themes with runtime accent theming, and local persistence for settings, view modes, layout and onboarding. The player supports demo playback, session file/folder and stream imports, fullscreen chrome auto-hide, picture-in-picture, a compact library overlay, drag-to-queue and add-to-playlist. Library, music, playlist and network data are mock data; the Tauri backend uses the v2 configuration schema and webview API, with a capability file for window controls, while native plugins, commands and media metadata access are planned.

The design reference exports (26 files: 25 PNGs + 1 SVG) live in the repository-root folder `VLC Redesign (Community)/`. They were created by [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) for her VLC redesign concept and are included as visual reference only. The 25 PNGs are the visual source of truth; the SVG is a collage of the same 21 screen images, not extra vector data. Canonical design tokens are documented in [design/01-design-system.md](design/01-design-system.md), the target direction in [design/02-redesign-vision.md](design/02-redesign-vision.md), and the full export inventory in [guides/02-design-reference.md](guides/02-design-reference.md).

## Documentation index

| Document | Description |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | Revision history of the English documentation and project milestones. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, design rules, checks, commit and documentation standards, translations, pull requests and licensing. |
| [architecture/01-overview.md](architecture/01-overview.md) | Tech stack, repository layout, architecture and design goals. |
| [architecture/02-frontend.md](architecture/02-frontend.md) | Svelte app structure, implemented components, stores, views, persistence keys and styling conventions. |
| [architecture/03-tauri-backend.md](architecture/03-tauri-backend.md) | Tauri v2 configuration, Rust entry point, window capabilities, custom decorations and planned commands. |
| [design/01-design-system.md](design/01-design-system.md) | Canonical semantic colour, typography, radius and component tokens, including the implemented dark and light themes. |
| [design/02-redesign-vision.md](design/02-redesign-vision.md) | Target redesign direction, with implemented, in-progress and planned items explicitly separated. |
| [guides/01-setup.md](guides/01-setup.md) | Prerequisites, installation, development, build, troubleshooting. |
| [guides/02-design-reference.md](guides/02-design-reference.md) | Inventory of the 26 design exports and how to use them as an implementation spec. |
| [guides/03-internationalization.md](guides/03-internationalization.md) | Language tags, translated landing pages, required files, terminology and the translation pull-request checklist. |

## Documentation layout

```
docs/
├── README.md
├── README.as-twi.md
├── CONTRIBUTING.md
├── assets/
│   ├── vlc.svg
│   └── screenshots/
└── en/
    ├── OVERVIEW.md
    ├── CHANGELOG.md
    ├── architecture/
    │   ├── 01-overview.md
    │   ├── 02-frontend.md
    │   └── 03-tauri-backend.md
    ├── design/
    │   ├── 01-design-system.md
    │   └── 02-redesign-vision.md
    └── guides/
        ├── 01-setup.md
        ├── 02-design-reference.md
        └── 03-internationalization.md
```

## Status labels

| Label | Meaning |
| --- | --- |
| **Implemented** | Present and wired in `src/` or `src-tauri/`. |
| **In progress** | Partially present; known gaps are called out in the relevant document. |
| **Planned** | Not implemented yet; described only as a target. |

## Documentation conventions

- Detailed documentation is **English-only** today. The Asante Twi README is a translated entry point; it links back to the English documentation and does not mirror the topic files. Full translation rules live in [guides/03-internationalization.md](guides/03-internationalization.md).
- `/docs/en/` is currently the only language root; it holds the required `OVERVIEW.md` / `CHANGELOG.md` pair.
- Domain folders (`architecture/`, `design/`, `guides/`) contain numbered topic documents only; they do not duplicate domain-level overview or changelog files.
- Topic files use sequential prefixes (`01-`, `02-`, ...).
- Paths, commands and code identifiers stay in English.
- Dark design values come from the PNG exports; the light palette is a project extension. The canonical token list lives in [design/01-design-system.md](design/01-design-system.md). Do not invent alternate hex values in component docs.

## Credits

- **Design reference:** [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) created the VLC redesign concept and the exports in `VLC Redesign (Community)/`. They remain her work and are not relicensed under MIT.
- **VLC and the cone mark:** the [VideoLAN](https://www.videolan.org/) project. This community redesign is not affiliated with or endorsed by VideoLAN.

## License

The UI redesign source and documentation are released under the [MIT License](../../LICENSE). libvlc and VLC-derived components remain under [LGPL-2.1-or-later](../../LICENSES/LGPL-2.1.txt); see [LICENSES/README.md](../../LICENSES/README.md) for scope. VLC, the VLC cone and libvlc are VideoLAN project marks or components and are not relicensed by this repository.
