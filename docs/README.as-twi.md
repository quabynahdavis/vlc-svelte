# VLC Redesign (Community)

**Kenkan yei wɔ:** [English](README.md) · **Asante Twi**

VLC Redesign (Community) yɛ desktop interface a wɔasisi ama VLC Media Player. Ɛkura VLC cone a ɛyɛ orange ne accent no so wɔ gray surfaces a ɛnyɛ dɛ, a corners no yɛ rectangular nanso ɛyɛ soft, ɛwɔ dark ne light theme mmienu ne accent a wobetumi asakra. Wɔde **Tauri v2 + Svelte 4 + TypeScript + Tailwind CSS** na ɛsii no, na **bun** na wɔde nneɛma no di dwuma.

## Nneɛma a ɛho hia

- **Player** — previous / play / next wɔ benkum; settings, fullscreen, queue, audio ne subtitles wɔ nifa. Volume a ɛte sɛ cone, seek bar a ɛyɛ kɛse a ɛwɔ hover thumbnails, ne next-episode prompt.
- **Fullscreen** — top ne bottom chrome a ɛde ne ho sie, na ɛba so bio bere a wode mouse ba so; picture-in-picture, library drawer ne transport overlay.
- **Library** — breadcrumbs, search, watched/unwatched filter, sorting, grid/list/details, file/folder/stream a wobɛka ho, ne drag-to-queue.
- **Music** — Songs, Albums, Artists ne Genres, a ɛwɔ cover art kɛse ne waveform strip a wobetumi apaw.
- **Queue ne playlists** — wɔate wɔn mu; create, pin, add-to-playlist ne drag-to-queue.
- **Network** — streams a wɔasie, a ɛwɔ add, edit, play ne remove.
- **Sidebar** — subtitle timeline, audio track ne output device, video filters, playback controls, bookmarks ne chapters.
- **Settings** — categories du-nsia (16), profiles, hotkeys window a ɛwɔ nkyɛn, subtitle matching a nnipa betumi akenkan, ne layout editor a wotumi drag na drop.
- **Onboarding** — welcome screen a ɛba nea ɛdi kan, ma theme, accent, kasa ne library folders.

## Nkyerɛw

Nkyerɛw a ɛyɛ nokware no wɔ Borɔfo kasa mu wɔ [`docs/en/`](en/OVERVIEW.md). Fi ase wɔ [OVERVIEW.md](en/OVERVIEW.md), na hwɛ index a ɛwɔ ase.

| Nkyerɛw | Nsɛm a ɛwɔ mu |
| --- | --- |
| [en/OVERVIEW.md](en/OVERVIEW.md) | Project no ho nsɛm, nkyerɛw index ne nhyehyɛeɛ. |
| [en/architecture/01-overview.md](en/architecture/01-overview.md) | Tech stack, repository layout, architecture ne design goals. |
| [en/architecture/02-frontend.md](en/architecture/02-frontend.md) | Svelte app structure, components, stores, views, persistence keys ne styling nhyehyɛeɛ. |
| [en/architecture/03-tauri-backend.md](en/architecture/03-tauri-backend.md) | Tauri v2 configuration, Rust entry point, capabilities ne commands a wɔayɛ nhyehyɛeɛ. |
| [en/design/01-design-system.md](en/design/01-design-system.md) | Colour, typography, radius ne component tokens ma theme mmienu no. |
| [en/design/02-redesign-vision.md](en/design/02-redesign-vision.md) | Target direction, a implemented, in-progress ne planned items wɔ mu. |
| [en/guides/01-setup.md](en/guides/01-setup.md) | Prerequisites, installation, development, build ne troubleshooting. |
| [en/guides/02-design-reference.md](en/guides/02-design-reference.md) | Design exports 26 no ne sɛnea wobɛde adi dwuma sɛ spec. |
| [en/CHANGELOG.md](en/CHANGELOG.md) | Project milestones ne nkyerɛw nsakraeɛ. |

Saa README yi yɛ Asante Twi translation a ɛfiri English README no mu. Nkyerɛw a ɛwɔ `docs/en/` no da so ara yɛ Borɔfo. English version no wɔ [README.md](README.md).

## Fi ase

```bash
bun install
bun run dev
```

- Frontend nkutoo wɔ browser mu: `bun run dev:frontend`
- Type-check: `bun run check`
- Production build: `bun run build`

Hwɛ [en/guides/01-setup.md](en/guides/01-setup.md) ma system packages ne script reference no.

## Nkyerɛw no nhyehyɛeɛ

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

| Label | Nkyerɛaseɛ |
| --- | --- |
| **Implemented** | Ɛwɔ hɔ na wɔde aka `src/` anaa `src-tauri/` ho. |
| **In progress** | Ɛrekɔ so; gaps a wɔnim no wɔ document a ɛfa ho. |
| **Planned** | Wɔnyɛɛ bi; wɔakyerɛ no sɛ target nkutoo. |

## Notes

- Library, music, playlist ne network data yɛ mock data.
- Imported media ne playlist tracks a wɔde `blob:` sources no wɔ session mu nkutoo. Pins, saved streams, subtitle profiles, bookmarks, layout ne onboarding na ɛkɔ so wɔ reload akyi.
- Design exports 26 (25 PNG + 1 SVG) wɔ repository-root folder `VLC Redesign (Community)/` mu. PNGs no ne visual source of truth.

---

**Kasa ahodoɔ:** [English](README.md) · **Asante Twi**
