# Design System

**Status:** canonical target specification measured from the design exports. The application shell and core components are implemented in `src/`; `tailwind.config.js` still carries interim approximations and will be aligned during the fidelity pass. Last updated 2026-10-26.

This document is the canonical token reference for the VLC Redesign UI. The source of truth is the **25 PNG files** in `VLC Redesign (Community)/` at the repository root. Rebuild the interface in Svelte and Tailwind; never embed the exports as application UI.

## Source of truth

- The 25 PNGs are authoritative for colour, spacing, type and component states.
- `VLC Redesign (Community).svg` (~30 MB) is **not** a vector master with extra data. It is a collage of the same 21 screen images already exported as PNGs. Do not mine it for additional measurements; use the PNGs.
- Earlier palette values in this document were approximations. The measured values below supersede them.

| File | Size | Contribution to this document |
| --- | --- | --- |
| `Player.png` | 7680 × 4320 | Master player frame: window chrome, icon rail, playlist panel, video canvas, transport bar, seek/volume tracks. |
| `Player-1.png` | 3840 × 2160 | 4K duplicate of the player frame; used to confirm proportions at a smaller scale. |
| `Player-2.png` | 1056 × 594 | Player with a purple accent variant. |
| `Player-3.png` | 1056 × 594 | Player with a pink/magenta accent variant. |
| `Player-4.png` | 1056 × 594 | Player with a blue accent variant. |
| `Settings - global.png` | 3234 × 2685 | Settings modal, category sidebar, segmented theme control, accent swatches, toggle switches, inputs and selects. |
| `Settings - audio.png` | 3234 × 2685 | Audio settings page, equalizer, toggle and slider variants. |
| `right-click menu.png` | 584 × 1366 | Floating context menu: surface, border, row height, hover, icons and shortcut labels. |
| `Subtitles.png` | 1600 × 3784 | Tab bar with orange underline, slider rows, toggle switch, colour fields and the Inter font declaration. |
| `Property 1=expanded.png` | 1440 × 2360 | Compressor property panel and slider rows. |
| `Property 1=expanded-1.png` | 1440 × 4192 | Equalizer property panel. |
| `Property 1=expanded-2.png` | 1440 × 1752 | Chorus property panel; clearest view of ticked slider tracks. |
| `Property 1=expanded-3.png` | 1440 × 1448 | Delay property panel. |
| `Property 1=expanded-4.png` | 1440 × 2664 | Video-adjustment property panel. |
| `Property 1=expanded-5.png` | 1440 × 608 | Collapsed property panel and padding controls. |
| `Property 1=expanded-6.png` | 1440 × 3020 | Colour-effects property panel. |
| `Frame 151.png`, `Frame 151-1.png`, `Frame 151-2.png` | 124 × 161 | Rounded theme-frame variants with purple, pink and neutral outlines. |
| `Frame 159.png`, `Frame 159-1.png`, `Frame 159-2.png` | 64 × 64 | Round disc variants in matching accent colours. |
| `name=disc, direction=default, state=default, value=default, EQ=default, two-tone=no.png` | 24 × 24 | Flat disc icon. |
| `name=disc, direction=default, state=default, value=default, EQ=default, two-tone=yes.png` | 24 × 24 | Two-tone disc icon. |
| `name=ui, direction=default, state=default, value=default, EQ=default, two-tone=no.png` | 24 × 24 | UI/hide-interface icon. |

## Colour tokens

The palette below is sampled directly from the PNGs. All component colours must resolve to these tokens.

| Token | Hex | Tailwind target | Role |
| --- | --- | --- | --- |
| `--accent` | `#D37918` | `vlc.orange` | VLC orange: primary action, active navigation icon, active tab underline, slider thumb, focus ring. |
| `--accent-pressed` | `#AB6314` | `vlc.orange-pressed` | Pressed/active state for accent controls and darker accent line icons. |
| `--accent-deepest` | `#371F06` | `vlc.orange-deepest` | Deep amber at the start of progress, seek, volume and slider fills. |
| `--bg-app` | `#0E0E0E` | `vlc.app` | Application background, player canvas surround, title bar, transport-bar base. |
| `--bg-panel` | `#181818` | `vlc.panel` | Icon rail, playlist panel, settings category column, floating menu surface. |
| `--bg-panel-alt` | `#191919` | `vlc.panel-alt` | Adjacent/secondary panel surface; one step above `--bg-panel`. |
| `--bg-card` | `#1B1B1B` | `vlc.card` | Cards, grouped settings surfaces, raised content blocks. |
| `--bg-raised` | `#232323` | `vlc.raised` | Hovered/selected rows, elevated controls, toggle tracks. |
| `--border` | `#373737` | `vlc.border` | Panel outlines, dividers, input borders, menu border. |
| `--border-subtle` | `#262626` | `vlc.border-subtle` | Low-contrast internal dividers and card outlines. |
| `--text-primary` | `#EAEAEA` | `vlc.text` | Headings, active labels, numeric values, menu labels on hover. |
| `--text-secondary` | `#B8B8B8` | `vlc.secondary` | Setting labels, inactive tabs, menu labels, descriptions. |
| `--text-muted` | `#8F8F8F` | `vlc.muted` | Inactive icons, secondary metadata, placeholders. |
| `--text-dim` | `#6B6B6B` | `vlc.dim` | Shortcut hints, captions, disabled labels and other non-essential text. |

### Usage rules

- **Use surface steps, not shadows, for hierarchy.** App `#0E0E0E` → panel `#181818` → panel alt `#191919` → card `#1B1B1B` → raised `#232323`. Do not invert the order.
- **Accent is functional, not decorative.** Limit `#D37918` to the primary action, active state, progress fill and focus ring. `#AB6314` is the pressed/darker companion; `#371F06` belongs in fills, not text or icons.
- **Amber fills are gradients.** Progress, seek, volume and active slider tracks run left-to-right from `#371F06` to `#D37918`. Solid `#D37918` is acceptable for small elements such as the play button, toggle knob and active indicator.
- **Text on accent** uses `#0E0E0E` (near-black), not white, for contrast on the orange play button.
- **Borders are quiet.** Use `#373737` for structural outlines and `#262626` for internal dividers. Avoid brighter outlines except on focus.
- **Text tiers are deliberate.** `#EAEAEA` for primary content, `#B8B8B8` for labels, `#8F8F8F` for metadata, `#6B6B6B` only for non-essential hints.

### Alternate accents

`Player-2.png`, `Player-3.png`, `Player-4.png` and `Settings - global.png` show accent variants (purple, pink, blue and a swatch row). The default remains VLC orange `#D37918`. Alternate accents replace `--accent`, `--accent-pressed` and `--accent-deepest`; neutral surfaces and text tokens stay unchanged. The current settings store carries ten swatches (orange, red, gold, green, teal, blue, indigo, purple, pink and grey); the non-orange values remain design data to sample and contrast-check before themes ship.

## Typography

| Property | Value | Source |
| --- | --- | --- |
| UI font family | **Inter** | `Subtitles.png` (Subtitle Font: `Inter`), all settings and property panels |
| Fallback stack | `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Project convention |
| Numeric style | Tabular figures for timers and slider readouts | `Player.png`, `Property 1=expanded-2.png` |

Observed hierarchy (approximate; confirm against the PNGs before hard-coding):

| Role | Size / weight | Colour |
| --- | --- | --- |
| Window or page title | 20–24 px / 600 | `#EAEAEA` |
| Section heading | 18–20 px / 600 | `#EAEAEA` |
| Setting row label | 14–16 px / 400–500 | `#B8B8B8` |
| Setting value | 14–16 px / 500 | `#EAEAEA` |
| Tab label | 14–16 px / 500 | `#B8B8B8` inactive, `#EAEAEA` active |
| Menu item | 16–18 px / 400 | `#B8B8B8`, `#EAEAEA` on hover |
| Shortcut hint | 13–14 px / 400 | `#6B6B6B` |
| Caption / help | 12–13 px / 400 | `#8F8F8F` |

Inter must be self-hosted or bundled with the app; do not add a runtime dependency on a font CDN.

## Shape, spacing and elevation

| Token | Value | Applies to | Source |
| --- | --- | --- | --- |
| Panel radius | `12px` | Modals, cards, context menu, property panels, floating surfaces. | `Settings - global.png`, `right-click menu.png`, `Property 1=expanded-2.png` |
| Control radius | `8px` | Buttons, toggles, segmented control, tabs, icon buttons. | `Settings - global.png`, `Subtitles.png` |
| Input radius | `6px` | Text fields, selects, number inputs, colour fields. | `Settings - global.png`, `Subtitles.png` |
| Border width | `1px` | Panel and input outlines, dividers. | `Settings - global.png` |
| Spacing grid | 4 px base; 8/12/16/24/32 px steps | Padding and gaps. | All exports |
| Panel padding | 24–32 px | Modal body and cards. | `Settings - global.png` |
| Row height | 40–48 px | Settings rows and menu items. | `Settings - global.png`, `right-click menu.png` |
| Elevation | Surface colour step + `0 8px 24px rgba(0,0,0,0.45)` only for floating menus/modals | Separate overlays from the app surface. | `right-click menu.png`, `Settings - global.png` |

Toggles, slider thumbs and accent swatches are fully rounded or circular even though panels and controls use the radii above.

## Implemented components

These files exist in `src/` and compose the current shell. They are the reference implementation for the token roles above.

| Component | File | Responsibility | Status |
| --- | --- | --- | --- |
| Application shell | `src/App.svelte` | Title bar, icon rail, view switching, property dock, settings overlay and shell-level context-menu actions. | Implemented |
| Title bar | `src/components/TitleBar.svelte` | 40 px custom chrome: VLC cone, centred title, settings and window controls; Tauri drag region. | Implemented |
| Icon rail | `src/components/IconRail.svelte` | 64 px primary navigation rail (Home, Videos, Music, Network, Playlists, Recent, Add) with accent active state. | Implemented |
| Playlist panel | `src/components/PlaylistPanel.svelte` | 300 px playlist sidebar with back, search, add, list/grid toggle and track list. | Implemented |
| Transport bar | `src/components/TransportBar.svelte` | 52 px control strip: previous/play/next, elapsed/total time, seek, buffered track, volume, audio/subtitle/settings/fullscreen/playlist. | Implemented |
| Library toolbar | `src/components/LibraryToolbar.svelte` | Back button, breadcrumb, item count, search and sort/view controls. | Implemented |
| Media card | `src/components/MediaCard.svelte` | 16:9 poster tile with title and thin progress hairline. | Implemented |
| Settings modal | `src/components/SettingsModal.svelte` | Full-window modal with search, grouped category sidebar and scrollable content pane. | Implemented |
| Settings panels | `src/components/settings/*.svelte` | General, Audio and Subtitles panes implemented; all other categories render `PlaceholderPanel`. | In progress |
| Context menu | `src/components/ContextMenu.svelte` | Floating right-click menu with icons, shortcuts, separators and submenus. | Implemented |
| Property panel | `src/components/PropertyPanel.svelte` | Docked 400 px effects panel with collapsible sections and slider/toggle/colour rows. | Implemented |
| Property slider | `src/components/PropertySlider.svelte` | Label/value row with tick-marked range control. | Implemented |

### Shell

`App.svelte` stacks the title bar above a horizontal body: icon rail, main view and optional property dock. `home` renders `PlayerView`, `videos` renders `LibraryView`, and the remaining rail destinations show a "Coming soon" placeholder. `SettingsModal` opens as a full-window overlay. Right-clicking the main area opens `ContextMenu`; menu actions drive the player store, the property dock and window close.

### Title bar

40 px bar on `#0E0E0E` with the VLC cone at the left, a centred `VLC Media Player` label in `#B8B8B8`, a settings button and minimise/maximise/close controls at the right. Window buttons are wired to the Tauri window API and degrade to console warnings in the browser. Source: `Player.png`.

### Icon rail

64 px vertical rail on `#181818` with stacked line icons and tooltips. The active item uses `#D37918` plus a 2 px left indicator; inactive icons use `#8F8F8F` and brighten to `#EAEAEA` on hover. Source: `Player.png`; the settings category column in `Settings - global.png` uses the same panel surface and active-accent pattern.

### Playlist panel

300 px panel on `#181818` with a 44 px header (back, title, more, open-in-new-window), a search field, list/grid toggle and playlist rows. Selected rows use `#232323`; metadata uses `#8F8F8F` and `#6B6B6B`. Source: `Player.png`.

### Transport bar

52 px strip on `#0E0E0E` with a top border against the video stage. Layout, left to right: previous, accent play/pause (34 × 30 px, `#D37918`), next, elapsed time, seek bar, total duration, volume icon and level, audio-track, subtitle, settings, fullscreen and playlist toggles. Timers use `#B8B8B8` tabular figures; the seek fill runs from `#371F06` to `#D37918` over a `#262626` track, and the thumb is white with an accent halo. Source: `Player.png`; accent variants in `Player-2.png`–`Player-4.png`.

### Library toolbar and media grid

Toolbar is 64 px high with a back button, breadcrumb (`ChevronRight` separators), live item count and a search field. The grid is responsive (2–5 columns) of 16:9 `MediaCard` tiles: `#1B1B1B` surface, `#262626` border, hover border `#3A3A3A`, title in `#B8B8B8`, progress hairline in `#D37918`. Source: `Player-1.png` and the library views.

### Settings modal

A full-window overlay on a dimmed app background with a `12px`-radius panel on `#0E0E0E`. The header holds a 300 px search field; the category sidebar is `#181818` with `#262626` divider; the content pane scrolls on `#0E0E0E`. Active categories use `#1B1B1B` and `#EAEAEA`; inactive labels use `#B8B8B8`; group headings and placeholders use `#6B6B6B`. General, Audio and Subtitles are implemented; Interface, Privacy, Controls, Playback, Video, Library, Network, Performance, Recording and Extensions are planned and currently render a placeholder. Source: `Settings - global.png`, `Settings - audio.png`, `Subtitles.png`.

### Context menu

A floating card on `#181818` with `12px` radius, `1px #262626` border and a soft shadow. Rows combine an accent line icon, a `#B8B8B8` label and a right-aligned `#6B6B6B` shortcut; hover/focus uses `#232323`. Separators are `#262626`; submenu rows end in a chevron. Source: `right-click menu.png`.

### Property panel and slider

Docked 400 px panel on `#0E0E0E` with a collapsible header, section labels and repeated rows of label + numeric value + full-width slider. Rows use `#B8B8B8`/`#EAEAEA` text, `#262626` tracks and `#D37918` fill; the thumb is white with an accent halo. Panels are separated by spacing rather than heavy dividers. Source: `Property 1=expanded.png` through `Property 1=expanded-6.png`.

### Supporting elements

- **Inputs and selects:** `#1B1B1B` field on a `#0E0E0E`/`#181818` surface, `6px` radius, `1px #262626` border, `#EAEAEA` value and `#6B6B6B` placeholder.
- **Window chrome:** `#0E0E0E` title bar with the VLC cone at the left, centred `VLC Media Player` label in `#B8B8B8`, and window controls at the right in `#B8B8B8`.
- **Cards/media tiles:** `#1B1B1B` tiles with a filename caption in `#B8B8B8`; hover raises the surface to `#232323`.
- **Toggle switch:** `#232323` track OFF, `#D37918` track ON, white knob, visible `ON`/`OFF` state word.

## Tailwind mapping

**Interim state:** `tailwind.config.js` currently defines the `vlc.*` palette with first-pass approximations (`#0B0B0B`, `#F08A1C`, `#FFFFFF`, `#262626`, …). Components also contain literal hex values sampled directly from the PNGs. Until the fidelity pass updates `tailwind.config.js` and replaces those literals, the config values are **not** the measured palette. The table lists the targets.

| Config key | Current (interim) | Target | Action |
| --- | --- | --- | --- |
| `vlc.app` | `#0B0B0B` | `#0E0E0E` | Update |
| `vlc.panel` | `#111111` | `#181818` | Update |
| `vlc.panel-alt` | — | `#191919` | Add |
| `vlc.card` | `#1A1A1A` | `#1B1B1B` | Update |
| `vlc.raised` | `#232323` | `#232323` | Match |
| `vlc.border` | `#262626` | `#373737` | Update |
| `vlc.border-subtle` | — | `#262626` | Add |
| `vlc.orange` | `#F08A1C` | `#D37918` | Update |
| `vlc.orange-pressed` | — | `#AB6314` | Add |
| `vlc.orange-dark` | `#A85A0F` | `#371F06` | Replace with `orange-deepest` |
| `vlc.text` | `#FFFFFF` | `#EAEAEA` | Update |
| `vlc.secondary` | `#B8B8B8` | `#B8B8B8` | Match |
| `vlc.muted` | `#7A7A7A` | `#8F8F8F` | Update |
| `vlc.dim` | — | `#6B6B6B` | Add |
| `backgroundImage.vlc-accent` | `135deg, #A85A0F → #F08A1C` | `90deg, #371F06 → #D37918` | Update |
| `vlc.danger` | `#E81123` | `#E81123` | Keep (semantic, not from the PNGs) |

Target configuration (not yet applied):

```js
// tailwind.config.js — target tokens
theme: {
  extend: {
    colors: {
      vlc: {
        app: '#0E0E0E',
        panel: '#181818',
        'panel-alt': '#191919',
        card: '#1B1B1B',
        raised: '#232323',
        border: '#373737',
        'border-subtle': '#262626',
        orange: '#D37918',
        'orange-pressed': '#AB6314',
        'orange-deepest': '#371F06',
        text: '#EAEAEA',
        secondary: '#B8B8B8',
        muted: '#8F8F8F',
        dim: '#6B6B6B',
        danger: '#E81123',
      },
    },
    backgroundImage: {
      'vlc-accent': 'linear-gradient(90deg, #371F06 0%, #D37918 100%)',
    },
    borderRadius: {
      panel: '12px',
      control: '8px',
      input: '6px',
    },
    fontFamily: {
      sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    },
  },
}
```

For runtime theming (alternate accents, light mode), expose the same values as CSS custom properties on `:root` and have Tailwind reference `var(--...)`. Do not duplicate raw hex values across components.

```css
/* src/app.css — target tokens, not yet applied */
:root {
  --bg-app: #0E0E0E;
  --bg-panel: #181818;
  --bg-panel-alt: #191919;
  --bg-card: #1B1B1B;
  --bg-raised: #232323;

  --accent: #D37918;
  --accent-pressed: #AB6314;
  --accent-deepest: #371F06;
  --accent-gradient: linear-gradient(90deg, var(--accent-deepest), var(--accent));

  --text-primary: #EAEAEA;
  --text-secondary: #B8B8B8;
  --text-muted: #8F8F8F;
  --text-dim: #6B6B6B;
  --border: #373737;
  --border-subtle: #262626;

  --radius-panel: 12px;
  --radius-control: 8px;
  --radius-input: 6px;
}
```

### Token application matrix

| Element | Surface | Text | Border | Radius |
| --- | --- | --- | --- | --- |
| App shell / transport bar | `--bg-app` | `--text-secondary` | `--border-subtle` | — |
| Icon rail / playlist / settings sidebar | `--bg-panel` (or `--bg-panel-alt` for an adjacent column) | `--text-muted`, `--text-primary` when active | `--border-subtle` | — |
| Card / grouped settings surface | `--bg-card` | `--text-primary` | `--border-subtle` | `--radius-panel` |
| Floating menu / modal | `--bg-panel` or `--bg-app` for the content pane | `--text-primary` | `--border` | `--radius-panel` |
| Hovered or selected row | `--bg-raised` | `--text-primary` | — | `--radius-control` |
| Primary action / play button | `--accent` or `--accent-gradient` | `--bg-app` | — | full |
| Input / select | `--bg-card` | `--text-primary`, `--text-dim` placeholder | `--border-subtle` | `--radius-input` |
| Toggle track OFF / ON | `--bg-raised` / `--accent` | `--text-secondary` / `--text-primary` | — | full |
| Slider track / fill | `--border-subtle` / `--accent-gradient` | `--text-secondary` | — | full |

## Accessibility and states

- **Focus:** 2 px `#D37918` ring with a 2 px offset; never remove focus outlines on dark surfaces.
- **Hover:** move one surface step up (`#1B1B1B` → `#232323`) and brighten text to `#EAEAEA`; do not change text colour alone.
- **Pressed:** use `#AB6314` for accent controls; do not darken neutral panels below `--bg-app`.
- **Disabled:** keep the shape, reduce opacity, and use `#6B6B6B`; do not rely on colour alone.
- **Toggles:** expose `role="switch"` / `aria-checked` and keep the visible `ON` / `OFF` label.
- **Tabs:** use `role="tab"` / `aria-selected`; the orange underline must not be the only active signal (also change text colour/weight).
- **Sliders:** implement as `<input type="range">` or an ARIA slider with keyboard support; show the numeric value in text.
- **Contrast:** `#EAEAEA` and `#B8B8B8` pass on the neutral surfaces; reserve `#8F8F8F` for metadata and `#6B6B6B` for non-essential text. Verify `#D37918` on `#0E0E0E` for small icons and accents.
- **Motion:** keep transitions short (120–160 ms) and respect `prefers-reduced-motion`.

## Implementation checklist

- [x] Build the application shell: title bar, icon rail, playlist panel, transport bar and settings overlay.
- [x] Build the library toolbar, media grid and media cards.
- [x] Build the context menu, property panel and property slider.
- [x] Implement the General, Audio and Subtitles settings panes.
- [ ] Update `tailwind.config.js` from the interim values to the measured palette above.
- [ ] Replace literal hex values in components with semantic tokens.
- [ ] Add Inter locally and confirm it is the default sans font.
- [ ] Implement the remaining settings categories (Interface, Privacy, Controls, Playback, Video, Library, Network, Performance, Recording, Extensions).
- [ ] Wire library card selection to the player and load real media.
- [ ] Cover off/on, hover, focus, active, disabled, min/mid/max slider and submenu-open states.
- [ ] Verify at 1200 × 800 against `Player.png` and `Settings - global.png`.
- [ ] Confirm the fill-gradient angle and volume-meter colour against the PNGs before release.

## Open questions

- The exact gradient angle for seek/volume fills is not encoded in the PNGs; a left-to-right (`90deg`) gradient matches the observed appearance.
- The volume level in `Player.png` shows a green segment outside the core palette; decide whether it becomes a semantic `--success` token or stays a player-only accent.
- The alternate accent swatches need exact sampled values and a contrast check before themes ship.
- Window chrome is drawn in the exports; on Linux/macOS/Windows the native decorations may differ. The current implementation uses a custom Tauri title bar.
