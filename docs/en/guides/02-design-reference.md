# Design Reference Inventory

The folder `VLC Redesign (Community)/` at the repository root contains the exported visual specification: **26 files (25 PNGs + 1 SVG)**. The exports are reference art, not application assets — rebuild the UI with HTML/Svelte/Tailwind rather than embedding screenshots. Canonical colour, typography and radius tokens live in [../design/01-design-system.md](../design/01-design-system.md); the dark palette is extracted from these files, while the light palette is a project extension.

> **Attribution:** these exports were created by [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) for her VLC redesign concept. They are included as visual reference only, remain her work and are not relicensed under this project's MIT license. The implementation in `src/` is an independent Svelte rebuild, branded Kanea.

## Inventory by screen

### Player — 5 files

| File | Size (px) | Contents |
| --- | --- | --- |
| `Player.png` | 7680 × 4320 | Full-resolution master of the player window. |
| `Player-1.png` | 3840 × 2160 | 4K version of the same player frame. |
| `Player-2.png` | 1056 × 594 | Player layout with a **purple** accent. |
| `Player-3.png` | 1056 × 594 | Player layout with a **pink/magenta** accent. |
| `Player-4.png` | 1056 × 594 | Player layout with a **blue** accent. |

The player is a dark, custom-chrome window with rounded corners. A `#0E0E0E` title bar runs across the top: VLC cone mark at the left, a centred `VLC Media Player` label, and minimise/maximise/close controls at the right. Below it, a narrow `#181818` icon rail (Home, Videos, Music, Network, Playlists, Recent, Add Item) sits to the left of an optional playlist panel and the black video canvas. The bottom transport bar contains, from left to right:

1. previous-item button;
2. an accent-filled circular play/pause button;
3. next-item button;
4. elapsed time (`00:02:10`);
5. a seek bar with accent fill and a round thumb;
6. total duration (`00:25:40`);
7. a volume icon with a green level indicator;
8. audio-track and subtitle icons;
9. a settings gear;
10. a fullscreen button.

Use `Player.png` / `Player-1.png` for proportions and spacing; use `Player-2..4` for accent theming. The implemented `PlayerView.svelte` follows this chrome with a media stage, playlist panel, right dock and transport bar; current control details are documented in [../design/01-design-system.md](../design/01-design-system.md).

### Right-click menu — 1 file

| File | Size (px) | Contents |
| --- | --- | --- |
| `right-click menu.png` | 584 × 1366 | Floating dark context menu with orange line icons, labels and keyboard shortcuts. |

Items, in order: **Play** (`Space`), **Stop** (`S`), **Previous Item** (`P`), **Next Item** (`N`), **Record** (`R`), **Hide UI** (`Ctrl + \`), then submenu rows **Playback**, **Video**, **Audio**, **Subtitle**, **More Settings**, **Playlist**, **Open Media**, and **Quit VLC** (`Ctrl + Q`). Submenu rows show a right chevron. Surface is a translucent dark gray with large rounded corners.

### Subtitles settings — 1 file

| File | Size (px) | Contents |
| --- | --- | --- |
| `Subtitles.png` | 1600 × 3784 | Tall subtitles settings panel with an orange accent. |

- Top tabs: **Playback**, **Video**, **Audio**, **Subtitles** (active, orange underline).
- **Defaults:** Subtitle Track `1`, Subtitle Language `English`.
- **Synchronization:** Subtitle Track Delay `-4.000 s` on a −10 s…+10 s slider; Subtitle Speed `1.000 fps`; Subtitle Duration Factor `0.000`.
- **Appearance:** Embedded Sub Format `OFF`; Subtitle Font `Inter`; Text Color `#B8B8B8`; Outline Color `#0C0C0C`.
- Footer: **Default Preset** collapsible row and **Open Advanced Settings** action.

### Settings modal — 2 files

| File | Size (px) | Contents |
| --- | --- | --- |
| `Settings - global.png` | 3234 × 2685 | Global Settings, General page. |
| `Settings - audio.png` | 3234 × 2685 | Audio Defaults page with equalizer. |

Both are large modal windows with a search field and a category sidebar:

- **App:** General (selected in the global export), Interface, Privacy, Controls.
- **Media:** Playback, Video, Audio (selected in the audio export), Subtitles, Library.
- **System:** Network, Performance, Recording, Extensions.

**Global Settings content:** Appearance (Interface language `English`; Theme `Dark` / `Light` / `System`; a row of nine accent swatches), Startup (confirmation/error dialogs `OFF`, automatic update check `OFF`), Diagnostics (Developer mode `OFF`, Save a log `ON`, log-file field + `Browse`, Log details `Errors only`), and an **Advanced Options** link.

**Audio Defaults content:** Effects (Equalizer `OFF`, preset `None`, expandable **Close Equalizer**), an 11-band vertical equalizer — Preamp `12.0 dB`, 60 Hz, 170 Hz, 310 Hz, 600 Hz, 1 kHz, 3 kHz, 6 kHz, 12 kHz, 14 kHz, 16 kHz (all `0.0 dB`) — then Two-pass `OFF`, Spatial audio `OFF`, Spatial audio mode `Headphone virtualization`, Stereo widening `OFF`.

### Property / effect panels — 7 files

All are 1440 px wide and show collapsible **Collapse Settings** panels with slider rows and numeric readouts. Despite the `Property` filename, the content is audio/video **effect parameters**, not a generic file-properties inspector. The `1=expanded` suffix is a Figma component-variant name, not a navigation label.

| File | Size (px) | Content (observed labels) |
| --- | --- | --- |
| `Property 1=expanded.png` | 1440 × 2360 | Compressor: FM5 / Peak 0.2, Attack 25.0 ms, Release 100.0 ms, Threshold −11.0 dB, Ratio 4.0 : 1, Knee Radius 5.0 dB, Makeup Gain 7.0 dB. |
| `Property 1=expanded-1.png` | 1440 × 4192 | 10-band EQ plus preamp: Preamp 12.0 dB, 60 Hz…16 kHz, each 0.0 dB. |
| `Property 1=expanded-2.png` | 1440 × 1752 | Chorus: Size 8.0, Width 10.0, Wet 4.0, Dry 5.0, Damp 5.0. |
| `Property 1=expanded-3.png` | 1440 × 1448 | Delay: Delay Time 20.0 ms, Feedback Gain 0.2 %, Crossfeed 0.3 %, Dry Mix 0.8 %. |
| `Property 1=expanded-4.png` | 1440 × 2664 | Video adjustments: Hue, Brightness, Contrast, Saturation, Gamma, Sharpen Sigma, Banding Removal Radius, Film Grain Variance. |
| `Property 1=expanded-5.png` | 1440 × 608 | Collapse padding: Top / Bottom / Left / Right, all `0 px`, with link toggles. |
| `Property 1=expanded-6.png` | 1440 × 3020 | Colour effects: Color Extraction and Color Threshold (`#FF0000`), Saturation, Similarity, Negate Colors, Posterize, Gradient, Color, Cartoon, Sepia Intensity. |

Common pattern: a collapsible header, a label + value line, a full-width slider with a rounded accent thumb. `PropertyPanel.svelte` and `PropertySlider.svelte` implement this pattern.

### Small assets — 9 files

| Files | Size (px) | Contents |
| --- | --- | --- |
| `Frame 151.png`, `Frame 151-1.png`, `Frame 151-2.png` | 124 × 161 | Rounded-square dark frames with purple, pink and neutral outlines, labelled "Dark" — theme/frame variants. |
| `Frame 159.png`, `Frame 159-1.png`, `Frame 159-2.png` | 64 × 64 | Compact disc/round variants in the same accent colours. |
| `name=disc, direction=default, state=default, value=default, EQ=default, two-tone=no.png` | 24 × 24 | Flat disc icon. |
| `name=disc, direction=default, state=default, value=default, EQ=default, two-tone=yes.png` | 24 × 24 | Two-tone disc icon. |
| `name=ui, direction=default, state=default, value=default, EQ=default, two-tone=no.png` | 24 × 24 | UI/hide-interface icon. |

These are component/asset exports for theme and icon states, not full screens.

### Vector source — 1 file

`VLC Redesign (Community).svg` (~30 MB) is the vector export of the design. It is useful for measurements and vector assets, but it is heavy; open it only when needed.

## Canonical design tokens

The palette is defined once in `src/app.css` and documented in [../design/01-design-system.md](../design/01-design-system.md). Use those tokens rather than sampling individual pixels: the PNGs composite translucent surfaces, so direct sampling produces slightly different values depending on the layer beneath. The dark values below are the measured export palette; the light values are the project's warm-neutral extension.

| Role | Token | Dark | Light |
| --- | --- | --- | --- |
| App background | `--bg-app` | `#0E0E0E` | `#F4F4F1` |
| Panel | `--bg-panel` | `#181818` | `#FFFFFF` |
| Panel alt | `--bg-panel-alt` | `#191919` | `#FAFAF8` |
| Card | `--bg-card` | `#1B1B1B` | `#FFFFFF` |
| Raised / hover | `--bg-raised` | `#232323` | `#ECECE8` |
| Accent (VLC orange) | `--accent` | `#D37918` | `#D37918` |
| Accent pressed | `--accent-pressed` | `#AB6314` | `#AB6314` |
| Fill start (deepest) | `--accent-deepest` | `#371F06` | `#371F06` |
| Accent text / icons | `--accent-ink` | `#D37918` | `#A0520B` |
| Primary text | `--text-primary` | `#EAEAEA` | `#1B1B19` |
| Secondary text | `--text-secondary` | `#B8B8B8` | `#4B4B47` |
| Muted text | `--text-muted` | `#8F8F8F` | `#6F6F69` |
| Dim text | `--text-dim` | `#6B6B6B` | `#8C8C86` |
| Border | `--border` | `#373737` | `#D6D6D0` |
| Border subtle | `--border-subtle` | `#262626` | `#E6E6E1` |

Alternate accents appear in `Player-2.png` (purple), `Player-3.png` (pink) and `Player-4.png` (blue); the swatch row in `Settings - global.png` is the observed set. Ten accent swatches are implemented in `src/stores/settings.ts`, and `src/lib/theme.ts` derives the pressed, deepest and gradient values at runtime. Only the default orange has been contrast-audited in light mode.

## Screen-to-code mapping

| Reference | Implemented file(s) | Status |
| --- | --- | --- |
| Player frames | `src/views/PlayerView.svelte`, `components/TitleBar.svelte`, `IconRail.svelte`, `PlaylistPanel.svelte`, `RightDock.svelte`, `TransportBar.svelte` | Shell, playlist, dock, transport and gestures implemented; fullscreen chrome auto-hide and PiP are in the working tree; native media sources pending |
| Library grid | `src/views/LibraryView.svelte`, `LibraryToolbar.svelte`, `LibraryAddMenu.svelte`, `MediaCard.svelte`, `MediaListRow.svelte` | Implemented with grid/list/compact, sorting, watched filter, clickable breadcrumbs and session file/folder/stream imports (working tree) |
| Menus | `src/components/ContextMenu.svelte` | Full title-bar menu plus a shorter right-click menu, including hover submenus and **Hide UI** |
| Settings modal | `src/components/SettingsModal.svelte` + `components/settings/*` | Sixteen categories implemented, including Layout and Profiles, with search, reset, persistence and JSON import/export |
| Property/effect panels | `components/PropertyPanel.svelte`, `PropertySlider.svelte` | Implemented; docked from `App.svelte` |
| Frames, disc and UI icons | Theme tokens and icon slots | Theme surfaces and icon slots implemented; the frame/disc exports are not shipped and two-tone menu glyphs are not rendered |
| Accent swatches and theme variants | `src/stores/settings.ts`, `src/lib/theme.ts`, `src/app.css` | Implemented: dark/light/system themes and ten runtime accent swatches |

## Using the exports as an implementation spec

1. **Pick one master per screen.** Player: `Player.png` or `Player-1.png`. Settings: `Settings - global.png` / `Settings - audio.png`. Subtitles: `Subtitles.png`. Menu: `right-click menu.png`.
2. **Fix a comparison viewport.** The app window is 1200 × 800 (`tauri.conf.json`). The player variants are 1056 × 594; compare proportionally rather than pixel-for-pixel across different sizes.
3. **Extract layout before styling.** Note the window chrome, the control-strip height, the order and spacing of controls, the sidebar width, and the modal padding. Translate them into Tailwind spacing rather than absolute positioning.
4. **Extract tokens.** Use the canonical palette in [../design/01-design-system.md](../design/01-design-system.md). Tokens are already defined once in `src/app.css` and mapped in `tailwind.config.js`; extend those layers instead of scattering hex values.
5. **Map to components.** Follow the table above; do not grow the view files further.
6. **Cover states.** Default, hover, focus, active, disabled; toggles on/off; slider at min/mid/max; menu submenu open; active tab; light and dark themes; accent variants (orange, purple, pink, blue and the other implemented swatches).
7. **Recreate, do not embed.** Screenshots are raster references. The 25 PNGs are the source of truth; the 30 MB SVG is a collage of the same 21 screen images, not extra vector data. Do not ship it as the app UI.
8. **Check accessibility.** Icon-only buttons need accessible names, focus rings must remain visible on dark surfaces, and text must keep sufficient contrast (`#6B6B6B` on `#181818` / `#1B1B1B` is low-contrast for body text — reserve it for secondary labels, shortcuts and placeholders).
9. **Visual acceptance.** At 1200 × 800, compare the player window, open menu, settings modal and subtitles panel side by side with the references. Document intentional deviations.

## Current gaps

- Library, music, playlist, recent and network content is mock data. Mock items use `public/demo/sample.mp4`; imported files and stream URLs are session-only and are not persisted.
- The player queue is not persisted, and no media is queued at startup.
- The full next-episode prompt, subtitle timeline, audio track/output-device selection, video filter previews, bookmarks/chapters, saved network streams, editable address bar, details view and add actions in the library empty state are planned. See [../design/02-redesign-vision.md](../design/02-redesign-vision.md).
- Recent and network selections are inert; create-playlist and per-track playlist menus are present but no-ops.
- True two-tone menu glyphs are not rendered, Inter is loaded from Google Fonts rather than self-hosted, and `src-tauri/icons/` still contains placeholder Tauri icons.
- There is no URL router and no automated test suite.
