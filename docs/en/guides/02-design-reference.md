# Design Reference Inventory

The folder `VLC Redesign (Community)/` at the repository root contains the exported visual specification: **26 files (25 PNGs + 1 SVG)**. The exports are reference art, not application assets — rebuild the UI with HTML/Svelte/Tailwind rather than embedding screenshots. Canonical colour, typography and radius tokens extracted from these files live in [../design/01-design-system.md](../design/01-design-system.md).

## Inventory by screen

### Player — 5 files

| File | Size (px) | Contents |
| --- | --- | --- |
| `Player.png` | 7680 × 4320 | Full-resolution master of the player window. |
| `Player-1.png` | 3840 × 2160 | 4K version of the same player frame. |
| `Player-2.png` | 1056 × 594 | Player layout with a **purple** accent. |
| `Player-3.png` | 1056 × 594 | Player layout with a **pink/magenta** accent. |
| `Player-4.png` | 1056 × 594 | Player layout with a **blue** accent. |

The player is a dark, custom-chrome window with rounded corners. A `#0B0B0B` title bar runs across the top: VLC cone mark at the left, a centred `VLC Media Player` label, and minimise/maximise/close controls at the right. Below it, a narrow `#111111` icon rail (Home, Videos, Music, Network, Playlists, Recent, Add Item) sits to the left of an optional playlist panel and the black video canvas. The bottom transport bar contains, from left to right:

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

Use `Player.png` / `Player-1.png` for proportions and spacing; use `Player-2..4` for accent theming. The current `PlayerView.svelte` does not match this chrome yet.

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

All are 1440 px wide and show collapsible **Collapse Settings** panels with slider rows and numeric readouts. Despite the `Property` filename, the content is audio/video **effect parameters**, not a generic file-properties inspector. The `1=expanded` suffix looks like a Figma component-variant name; confirm with the design owner before treating it as a navigation label.

| File | Size (px) | Content (observed labels) |
| --- | --- | --- |
| `Property 1=expanded.png` | 1440 × 2360 | Compressor: FM5 / Peak 0.2, Attack 25.0 ms, Release 100.0 ms, Threshold −11.0 dB, Ratio 4.0 : 1, Knee Radius 5.0 dB, Makeup Gain 7.0 dB. |
| `Property 1=expanded-1.png` | 1440 × 4192 | 10-band EQ plus preamp: Preamp 12.0 dB, 60 Hz…16 kHz, each 0.0 dB. |
| `Property 1=expanded-2.png` | 1440 × 1752 | Chorus: Size 8.0, Width 10.0, Wet 4.0, Dry 5.0, Damp 5.0. |
| `Property 1=expanded-3.png` | 1440 × 1448 | Delay: Delay Time 20.0 ms, Feedback Gain 0.2 %, Crossfeed 0.3 %, Dry Mix 0.8 %. |
| `Property 1=expanded-4.png` | 1440 × 2664 | Video adjustments: Hue, Brightness, Contrast, Saturation, Gamma, Sharpen Sigma, Banding Removal Radius, Film Grain Variance. |
| `Property 1=expanded-5.png` | 1440 × 608 | Collapse padding: Top / Bottom / Left / Right, all `0 px`, with link toggles. |
| `Property 1=expanded-6.png` | 1440 × 3020 | Colour effects: Color Extraction and Color Threshold (`#FF0000`), Saturation, Similarity, Negate Colors, Posterize, Gradient, Color, Cartoon, Sepia Intensity. |

Common pattern: a collapsible header, a label + value line, a full-width slider with a rounded accent thumb. This is the basis for the planned `SliderRow` / `EffectPanel` components.

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

The palette is defined once in [../design/01-design-system.md](../design/01-design-system.md). Use those tokens rather than sampling individual pixels: the PNGs composite translucent surfaces, so direct sampling produces slightly different values depending on the layer beneath.

| Role | Token | Value |
| --- | --- | --- |
| App background | `--bg-app` | `#0B0B0B` |
| Sidebar | `--bg-sidebar` | `#111111` |
| Card / modal / menu | `--bg-card` | `#1A1A1A` |
| Raised / hover | `--bg-raised` | `#232323` |
| Accent (VLC orange) | `--accent` | `#F08A1C` |
| Accent gradient start | `--accent-deep` | `#A85A0F` |
| Primary text | `--text-primary` | `#FFFFFF` |
| Secondary text | `--text-secondary` | `#B8B8B8` |
| Muted text | `--text-muted` | `#7A7A7A` |
| Border | `--border` | `#262626` |

Alternate accents appear in `Player-2.png` (purple), `Player-3.png` (pink) and `Player-4.png` (blue); the nine swatches in `Settings - global.png` are the full observed set. Only the orange value is canonical today; sample the others when alternate theming is implemented.

## Screen-to-code mapping

| Reference | Current target | Status |
| --- | --- | --- |
| Player frames | `src/views/PlayerView.svelte`; planned split into `components/player/*` | Scaffold exists; chrome/layout not aligned |
| Right-click menu | Planned `components/menu/ContextMenu.svelte` | Planned |
| Subtitles panel | Planned `components/settings/SubtitlesPanel.svelte` | Planned |
| Global / Audio settings | `src/views/SettingsView.svelte`; planned settings modal + sidebar + `ToggleRow` / `SliderRow` / `Equalizer` | Only three static controls exist |
| Property/effect panels | Planned `components/settings/EffectPanel.svelte`, `SliderRow.svelte` | Planned |
| Frames, disc and UI icons | Planned theme tokens and icon slots | Planned |
| Accent swatches and theme variants | Tokens in [../design/01-design-system.md](../design/01-design-system.md) | Documented; not wired |

## Using the exports as an implementation spec

1. **Pick one master per screen.** Player: `Player.png` or `Player-1.png`. Settings: `Settings - global.png` / `Settings - audio.png`. Subtitles: `Subtitles.png`. Menu: `right-click menu.png`.
2. **Fix a comparison viewport.** The app window is 1200 × 800 (`tauri.conf.json`). The player variants are 1056 × 594; compare proportionally rather than pixel-for-pixel across different sizes.
3. **Extract layout before styling.** Note the window chrome, the control-strip height, the order and spacing of controls, the sidebar width, and the modal padding. Translate them into Tailwind spacing rather than absolute positioning.
4. **Extract tokens.** Use the canonical palette in [../design/01-design-system.md](../design/01-design-system.md); define each value once in `tailwind.config.js` (`theme.extend`) or as a CSS custom property instead of scattering hex values.
5. **Map to components.** Follow the table above; do not grow the two views further.
6. **Cover states.** Default, hover, focus, active, disabled; toggles on/off; slider at min/mid/max; menu submenu open; active tab; accent variants (orange, purple, pink, blue).
7. **Recreate, do not embed.** Screenshots are raster references. The SVG source is the only vector source; do not ship a 30 MB SVG as the app UI.
8. **Check accessibility.** Icon-only buttons need accessible names, focus rings must remain visible on dark surfaces, and text must keep sufficient contrast (the muted `#7A7A7A` on `#111111` / `#1A1A1A` is low-contrast for body text — reserve it for secondary labels, shortcuts and placeholders).
9. **Visual acceptance.** At 1200 × 800, compare the player window, open menu, settings modal and subtitles panel side by side with the references. Document intentional deviations.

## Current gaps

- The app shell uses a light gray navigation bar; the references show a dark window with custom chrome.
- The player still displays native browser controls alongside the custom bar and has no working seek/volume/fullscreen behavior.
- No context menu, subtitle panel, settings categories, equalizer or effect panels exist.
- The settings screen has only three static controls and does not apply a theme.
- No accent-colour theming or Inter font is wired up.
- No local-media picker or metadata display exists yet.
