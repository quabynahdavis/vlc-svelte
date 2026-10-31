<div align="center">

<img src="assets/vlc.svg" width="72" alt="VLC cone" />

<h1>VLC Redesign (Community)</h1>

<p><strong>VLC Media Player desktop interface a mpɔtam hɔ na ɛsii.</strong><br />
Orange cone, neutral gray surfaces, soft rectangular corners, ne dark/light theme mmienu.</p>

<p>
  <a href="https://github.com/quabynahdavis/vlc-svelte/releases"><img src="https://img.shields.io/badge/version-1.0.0-FF8800?style=flat-square&logo=github&logoColor=white" alt="Version 1.0.0" /></a>
  <a href="https://github.com/quabynahdavis/vlc-svelte"><img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-FF8800?style=flat-square&logo=tauri&logoColor=white" alt="Platforms: Linux, macOS, Windows" /></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2" /></a>
  <a href="https://svelte.dev"><img src="https://img.shields.io/badge/Svelte-4-FF3E00?style=flat-square&logo=svelte&logoColor=white" alt="Svelte 4" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 3" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.x-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun" /></a>
</p>

<p>
  <a href="https://github.com/quabynahdavis/vlc-svelte/stargazers"><img src="https://img.shields.io/github/stars/quabynahdavis/vlc-svelte?style=flat-square&logo=github&color=FF8800" alt="GitHub stars" /></a>
  <a href="https://github.com/quabynahdavis/vlc-svelte/forks"><img src="https://img.shields.io/github/forks/quabynahdavis/vlc-svelte?style=flat-square&logo=github&color=FF8800" alt="GitHub forks" /></a>
  <a href="https://github.com/quabynahdavis/vlc-svelte/issues"><img src="https://img.shields.io/github/issues/quabynahdavis/vlc-svelte?style=flat-square&logo=github&color=FF8800" alt="Open issues" /></a>
  <a href="https://github.com/quabynahdavis/vlc-svelte/commits/main"><img src="https://img.shields.io/github/last-commit/quabynahdavis/vlc-svelte?style=flat-square&logo=git&color=FF8800" alt="Last commit" /></a>
  <a href="README.md"><img src="https://img.shields.io/badge/docs-English%20%7C%20Asante%20Twi-FF8800?style=flat-square&logo=readthedocs&logoColor=white" alt="Documentation in English and Asante Twi" /></a>
</p>

<p>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-MIT-FF8800?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT License" /></a>
  <a href="../LICENSES/LGPL-2.1.txt"><img src="https://img.shields.io/badge/libvlc-LGPL--2.1--or--later-FF8800?style=flat-square&logo=gnu&logoColor=white" alt="libvlc: LGPL-2.1-or-later" /></a>
</p>

<p><a href="README.md">English</a> · <strong>Asante Twi</strong></p>

</div>

![VLC Redesign player a ɛwɔ compact library drawer](assets/screenshots/compact-library.png)

## Ne botae

VLC yɛ media player a ɛyɛ den na ɛwɔ hɔ mfeɛ pii, nanso ne interface no yɛ adeɛ a ɛyɛ den sɛ wɔbɛfa so. Saa project yi bɔ mmɔden sɛ ɛbɛma VLC anya interface foforɔ a ɛyɛ mmerɛw, a ɛkura orange cone ne VLC no su, nanso ɛwɔ neutral gray surfaces, soft rectangular corners ne dark/light theme mmienu.

## Nneɛma a ɛho hia

| | |
| --- | --- |
| 🎬 **Player** | Previous / play / next wɔ benkum; settings, fullscreen, queue, audio ne subtitles wɔ nifa. Cone volume, seek bar a ɛyɛ kɛse a ɛwɔ hover thumbnails, ne next-episode prompt. |
| 🖥️ **Fullscreen** | Chrome a ɛde ne ho sie na ɛba so bio, picture-in-picture, library drawer ne transport overlay. |
| 🗂️ **Library** | Breadcrumbs, search, watched/unwatched filter, sorting, grid/list/details, imports ne drag-to-queue. |
| 🎵 **Music** | Songs, Albums, Artists ne Genres, a ɛwɔ cover art kɛse ne waveform strip a wobetumi apaw. |
| 📚 **Queue ne playlists** | Wɔate wɔn mu; create, pin, add-to-playlist ne drag-to-queue. |
| 🌐 **Network** | Saved streams; add, edit, play ne remove. |
| 🎛️ **Sidebar** | Subtitle timeline, audio track ne output device, video filters, playback controls, bookmarks ne chapters. |
| ⚙️ **Settings** | Categories 16, profiles, hotkeys window a ɛwɔ nkyɛn, subtitle matching a nnipa betumi akenkan, ne drag-and-drop layout editor. |
| ✨ **Onboarding** | Welcome screen a ɛba nea ɛdi kan ma theme, accent, kasa ne library folders. |

## Project no ho akontaabu

| | | |
| :---: | :---: | :---: |
| 🧩 **62**<br />Svelte components | 🗂️ **6**<br />browse views | ⚙️ **16**<br />settings categories |
| 🎨 **2**<br />themes + accent | 💾 **10**<br />persisted keys | 🖥️ **3**<br />desktop platforms |

## Screenshots

| Player | Library |
| --- | --- |
| ![Player](assets/screenshots/player.png) | ![Library](assets/screenshots/library.png) |
| **Music** | **Settings** |
| ![Music](assets/screenshots/music.png) | ![Settings](assets/screenshots/settings.png) |
| **Layout editor** | **Ka playlist ho** |
| ![Layout editor](assets/screenshots/layout.png) | ![Ka playlist ho](assets/screenshots/add-to-playlist.png) |

### Light theme

![Light theme library](assets/screenshots/light.png)

## Download

[![Download release a ɛyɛ foforɔ](https://img.shields.io/badge/Download-GitHub%20Releases-FF8800?style=for-the-badge&logo=github&logoColor=white)](https://github.com/quabynahdavis/vlc-svelte/releases)

Wɔato prebuilt desktop bundles gu [Releases](https://github.com/quabynahdavis/vlc-svelte/releases) page so. Release biara nni hɔ; kosi saa bere no, fi source mu na di dwuma:

```bash
git clone https://github.com/quabynahdavis/vlc-svelte.git
cd vlc-svelte
bun install
bun run dev
```

- Frontend nkutoo wɔ browser mu: `bun run dev:frontend`
- Type-check: `bun run check`
- Production build: `bun run build`

Hwɛ [en/guides/01-setup.md](en/guides/01-setup.md) ma system packages ne script reference no.

## Nkyerɛw

Nkyerɛw a ɛyɛ nokware no wɔ Borɔfo kasa mu wɔ [`docs/en/`](en/OVERVIEW.md). English version a ɛwɔ README yi wɔ [README.md](README.md).

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
| [en/guides/03-internationalization.md](en/guides/03-internationalization.md) | Language tags, translated landing pages, required files, terminology ne translation PR checklist. |
| [en/CHANGELOG.md](en/CHANGELOG.md) | Project milestones ne nkyerɛw nsakraeɛ. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, design rules, checks, commit ne documentation standards, translations, pull requests ne licensing. |

## Status

| Label | Nkyerɛaseɛ |
| --- | --- |
| ✅ **Implemented** | Shell, player, browse views 6, right dock, settings categories 16, themes, persistence, drag-to-queue ne add-to-playlist. |
| 🚧 **In progress** | Next-episode countdown, library address bar a wobetumi asesa, ne details view. |
| 🗓️ **Planned** | Native media scanning ne metadata, native playback, OS media keys ne `blob:` imports a ɛkɔ so. |

Library, music, playlist ne network data yɛ mock data. Imported media ne playlist tracks a wɔde `blob:` sources no wɔ session mu nkutoo; pins, saved streams, subtitle profiles, bookmarks, layout ne onboarding na ɛkɔ so wɔ reload akyi.

## Mfiridwuma a wɔde di dwuma

| Layer | Choice |
| --- | --- |
| Desktop shell | Tauri v2 (Rust) |
| UI | Svelte 4 + TypeScript |
| Styling | Tailwind CSS 3 a ɛwɔ semantic CSS tokens |
| Tooling | bun, Vite 5, svelte-check |

## Mmoa a wobɛboa

Kenkan [contributing guide](CONTRIBUTING.md) ma setup, design rules, checks, atomic commit ne documentation standards, ne translation workflow. Contributing guide no wɔ Borɔfo kasa mu. Yɛma issues ne pull requests akwaaba wɔ [GitHub](https://github.com/quabynahdavis/vlc-svelte).

## Nkaeɛ

- **Design reference:** [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) na ɔyɛɛ VLC redesign concept ne exports a ɛwɔ `VLC Redesign (Community)/`. Wɔde wɔn sii hɔ sɛ visual reference; wɔn adwuma no da so yɛ wɔn dea, na ɛnyɛ MIT license ase.
- **VLC ne cone mark:** [VideoLAN](https://www.videolan.org/) project. Saa community redesign yi nni VideoLAN affiliation anaasɛ endorsement.
- **Stack:** Tauri, Svelte, Tailwind CSS ne bun.

## License

UI redesign source ne documentation a ɛfiri yɛn nkyɛn no wɔ [MIT License](../LICENSE) ase. libvlc ne VLC-derived components no da so wɔ [LGPL-2.1-or-later](../LICENSES/LGPL-2.1.txt) ase; hwɛ [LICENSES/README.md](../LICENSES/README.md) ma scope no. VLC, VLC cone ne libvlc yɛ VideoLAN project marks anaa components; saa repository yi nnye wɔn license.

---

**Kasa ahodoɔ:** [English](README.md) · **Asante Twi**
