# Design System

**Status:** target specification extracted from the design exports. The tokens are **not yet implemented** in `tailwind.config.js` or the Svelte components. Last updated 2026-10-26.

This document is the canonical token reference for the VLC Redesign UI. The source of truth is the exported artwork in `VLC Redesign (Community)/` at the repository root. Rebuild the interface in HTML, Svelte and Tailwind; never embed the exports as application UI.

## Source exports

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

`VLC Redesign (Community).svg` (~30 MB) is the vector master. Use it only to confirm measurements that are ambiguous in the PNGs; do not ship it as an asset.

## Colour tokens

| Token | Value | Role | Source |
| --- | --- | --- | --- |
| `--bg-app` | `#0B0B0B` | Application background, player surround, title bar, transport-bar base. | `Player.png`, `Player-1.png` |
| `--bg-sidebar` | `#111111` | Icon rail, settings category sidebar, secondary navigation columns. | `Player.png`, `Settings - global.png` |
| `--bg-card` | `#1A1A1A` | Cards, grouped settings surfaces, modal body, context-menu surface. | `Settings - global.png`, `right-click menu.png`, `Property 1=expanded-2.png` |
| `--bg-raised` | `#232323` | Raised rows, hover/selected rows, toggle tracks, segmented-control container, inset controls. | `Settings - global.png`, `Subtitles.png` |
| `--accent` | `#F08A1C` | VLC orange: primary actions, active tab underline, slider thumb, selected navigation, ON state. | `Player.png`, `Settings - global.png`, `Subtitles.png` |
| `--accent-deep` | `#A85A0F` | Dark end of the amber fill gradient. | `Player.png`, `Subtitles.png`, `Property 1=expanded-2.png` |
| `--accent-gradient` | `#A85A0F` → `#F08A1C` | Horizontal fill for seek bars, volume bars and active slider tracks. | `Player.png`, `Subtitles.png` |
| `--text-primary` | `#FFFFFF` | Headings, active labels, numeric values, menu item labels. | `Settings - global.png`, `right-click menu.png` |
| `--text-secondary` | `#B8B8B8` | Setting labels, inactive tabs, descriptions. | `Settings - global.png`, `Subtitles.png` |
| `--text-muted` | `#7A7A7A` | Shortcut hints, placeholders, tertiary metadata. | `right-click menu.png`, `Settings - global.png` |
| `--border` | `#262626` | 1 px panel outlines, dividers, input borders, menu border. | `Settings - global.png`, `right-click menu.png` |

### Usage rules

- **Use surface steps, not shadows, for hierarchy.** App → sidebar → card → raised is the elevation order; do not invert it.
- **Accent is functional, not decorative.** Limit `#F08A1C` to the primary action, active state, progress fill and focus ring. Large orange fields are not part of the reference.
- **Amber fills are gradients.** Progress and active slider fills run left-to-right from `#A85A0F` to `#F08A1C`; solid orange is acceptable for small elements such as the play button and toggle knob.
- **Text on accent** should be `#0B0B0B` (near-black), not white, for contrast on the orange play button.
- **Muted text is not body text.** `#7A7A7A` on `#111111` / `#1A1A1A` is suitable only for shortcuts, placeholders and non-essential metadata.
- **Borders are subtle.** Use `1px solid #262626`; avoid brighter outlines except on focus.

### Alternate accents

`Player-2.png`, `Player-3.png`, `Player-4.png` and `Settings - global.png` show accent variants (purple, pink, blue, plus the swatch row). The default remains VLC orange. Alternate accents must replace `--accent` and `--accent-deep`; the neutral surfaces and text tokens stay unchanged. Exact swatch values are not yet tokenised and should be sampled from `Settings - global.png` when theming is implemented.

## Typography

| Property | Value | Source |
| --- | --- | --- |
| UI font family | **Inter** | `Subtitles.png` (Subtitle Font: `Inter`), all settings and property panels |
| Fallback stack | `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Project convention |
| Numeric style | Tabular figures for timers and slider readouts | `Player.png`, `Property 1=expanded-2.png` |

Observed hierarchy (approximate; confirm against the master exports before hard-coding):

| Role | Size / weight | Colour |
| --- | --- | --- |
| Window or page title | 20–24 px / 600 | `#FFFFFF` |
| Section heading | 18–20 px / 600 | `#FFFFFF` |
| Setting row label | 14–16 px / 400–500 | `#B8B8B8` |
| Setting value | 14–16 px / 500 | `#FFFFFF` |
| Tab label | 14–16 px / 500 | `#B8B8B8` inactive, `#FFFFFF` active |
| Menu item | 16–18 px / 400 | `#FFFFFF` |
| Shortcut hint | 13–14 px / 400 | `#7A7A7A` |
| Caption / help | 12–13 px / 400 | `#7A7A7A` |

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

## Components observed

### Icon rail

A narrow vertical rail on the far left, `#111111`, roughly 64–72 px wide, with stacked line icons (Home, Videos, Music, Network, Playlists, Recent, Add). The active item uses `#F08A1C`; inactive icons use `#B8B8B8` and brighten on hover. Labels appear as tooltips or beside the icon when the rail is expanded. Source: `Player.png`, `Player-1.png`; the settings category column in `Settings - global.png` uses the same sidebar surface and active-accent pattern.

### Transport bar

The bottom control strip spans the window on `#0B0B0B` with a top border or surface step against the video canvas. Layout, left to right: previous, accent circular play/pause, next, elapsed time, seek bar, total duration, volume icon and level, audio-track, subtitle, settings and fullscreen. Timers use `#B8B8B8`; the seek fill uses the amber gradient with a circular `#F08A1C` thumb. Source: `Player.png`, `Player-1.png`; accent variants in `Player-2.png`, `Player-3.png`, `Player-4.png`.

### Settings modal

A centred floating panel on a dimmed app background. The panel body is `#1A1A1A` with a `12px` radius and `1px #262626` border; the category sidebar is `#111111`; the header contains a search field and close button. Category groups are separated by muted headings. Source: `Settings - global.png`, `Settings - audio.png`.

### Context menu

A floating `#1A1A1A` card with `12px` radius and `1px #262626` border. Rows combine an accent line icon, a white label and a right-aligned `#7A7A7A` shortcut; hover uses `#232323`. Submenu rows end in a chevron. Source: `right-click menu.png`.

### Toggle switch

A pill track with a circular knob. OFF uses a `#232323` track with `#7A7A7A` label; ON uses `#F08A1C` with a near-black or white knob and a white `ON` label. The reference places the state word (`OFF` / `ON`) beside the switch. Source: `Settings - global.png`, `Settings - audio.png`, `Subtitles.png`.

### Sliders

Full-width horizontal track with a `#232323` or near-black groove, an amber gradient fill and a circular `#F08A1C` thumb. The label sits above-left and the numeric value above-right; property panels add tick marks along the track. Source: `Subtitles.png`, `Property 1=expanded-2.png`, `Property 1=expanded-1.png`.

### Tab bar with orange underline

A horizontal tab row (Playback, Video, Audio, Subtitles) on a dark surface. The active tab uses white text and a 2 px `#F08A1C` underline; inactive tabs use `#B8B8B8`. Source: `Subtitles.png`.

### Segmented control

A three-part control (Dark / Light / System) inside a `#232323` container with an `8px` radius. The selected segment uses an amber-tinted fill and `#F08A1C` border; unselected segments use `#B8B8B8` text. Source: `Settings - global.png`.

### Accent colour swatches

A row of nine rounded-square swatches. The default orange (`#F08A1C`) is first; the selected swatch carries a visible ring or border. Observed variants include orange, coral/red, olive/yellow, green, cyan/blue, blue, purple, pink and grey. Treat the non-orange values as design data to sample, not as final tokens. Source: `Settings - global.png`.

### Property slider rows

A card-based panel with a collapsible `Collapse Settings` header, then repeated rows of label + numeric value + full-width slider. Panels use `#1A1A1A`, `12px` radius and `#262626` borders; rows are separated by spacing rather than heavy dividers. Source: `Property 1=expanded.png` through `Property 1=expanded-6.png`.

### Supporting elements

- **Inputs and selects:** near-black `#0B0B0B` field on a `#1A1A1A` surface, `6px` radius, `1px #262626` border, `#FFFFFF` value and `#7A7A7A` placeholder. Source: `Settings - global.png`, `Subtitles.png`.
- **Window chrome:** `#0B0B0B` title bar with the VLC cone at the left, centred `VLC Media Player` label in `#B8B8B8`, and minimise/maximise/close controls at the right in `#B8B8B8`. Source: `Player.png`, `Player-1.png`.
- **Cards/media tiles:** `#1A1A1A` tiles with `12px` radius and a filename caption in `#B8B8B8`; hover raises the surface to `#232323`. Source: `Player-1.png`.

## Tailwind mapping

The current `tailwind.config.js` has an empty `theme.extend`. When implementing the tokens, add them once and reference the semantic names from components:

```js
// tailwind.config.js — target tokens, not yet applied
theme: {
  extend: {
    colors: {
      app: '#0B0B0B',
      sidebar: '#111111',
      card: '#1A1A1A',
      raised: '#232323',
      accent: {
        DEFAULT: '#F08A1C',
        deep: '#A85A0F',
      },
      content: {
        primary: '#FFFFFF',
        secondary: '#B8B8B8',
        muted: '#7A7A7A',
      },
      line: '#262626',
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
  --bg-app: #0B0B0B;
  --bg-sidebar: #111111;
  --bg-card: #1A1A1A;
  --bg-raised: #232323;

  --accent: #F08A1C;
  --accent-deep: #A85A0F;
  --accent-gradient: linear-gradient(90deg, var(--accent-deep), var(--accent));

  --text-primary: #FFFFFF;
  --text-secondary: #B8B8B8;
  --text-muted: #7A7A7A;
  --border: #262626;

  --radius-panel: 12px;
  --radius-control: 8px;
  --radius-input: 6px;
}
```

### Token application matrix

| Element | Surface | Text | Border | Radius |
| --- | --- | --- | --- | --- |
| App shell / transport bar | `--bg-app` | `--text-secondary` | — | — |
| Icon rail / settings sidebar | `--bg-sidebar` | `--text-secondary`, `--text-primary` when active | — | — |
| Card / modal / context menu | `--bg-card` | `--text-primary` | `--border` | `--radius-panel` |
| Hovered or selected row | `--bg-raised` | `--text-primary` | — | `--radius-control` |
| Primary action / play button | `--accent` or `--accent-gradient` | `--bg-app` | — | full |
| Input / select | `--bg-app` | `--text-primary` | `--border` | `--radius-input` |
| Toggle track OFF / ON | `--bg-raised` / `--accent` | `--text-secondary` / `--text-primary` | — | full |
| Slider track / fill | `--bg-raised` or near-black / `--accent-gradient` | `--text-secondary` | — | full |

## Accessibility and states

- **Focus:** 2 px `#F08A1C` ring with a 2 px offset; never remove focus outlines on dark surfaces.
- **Hover:** move one surface step up (`#1A1A1A` → `#232323`); do not change text colour alone.
- **Disabled:** keep the shape, reduce opacity, and use `#7A7A7A`; do not rely on colour alone.
- **Toggles:** expose `role="switch"` / `aria-checked` and keep the visible `ON` / `OFF` label.
- **Tabs:** use `role="tab"` / `aria-selected`; the orange underline must not be the only active signal (also change text colour/weight).
- **Sliders:** implement as `<input type="range">` or an ARIA slider with keyboard support; show the numeric value in text.
- **Contrast:** `#FFFFFF` and `#B8B8B8` pass on the neutral surfaces; reserve `#7A7A7A` for non-essential text. Verify `#F08A1C` on `#0B0B0B` for small icons.
- **Motion:** keep transitions short (120–160 ms) and respect `prefers-reduced-motion`.

## Implementation checklist

- [ ] Add Inter locally and set it as the default sans font.
- [ ] Define the colour, radius and font tokens in `tailwind.config.js` (or as CSS variables).
- [ ] Replace the light navigation bar and `blue-600` accents with the dark shell and `#F08A1C`.
- [ ] Build the primitives first: `IconButton`, `Toggle`, `Slider`, `TabBar`, `SegmentedControl`, `Card`, `ContextMenu`.
- [ ] Compose the player chrome (icon rail, playlist panel, transport bar) from `Player.png`.
- [ ] Compose the settings modal, subtitles panel and property panels from their respective exports.
- [ ] Cover off/on, hover, focus, active, disabled, min/mid/max slider and submenu-open states.
- [ ] Verify at the app window size of 1200 × 800 against `Player.png` and `Settings - global.png`.
- [ ] Confirm the amber gradient angle and volume-meter green against the master exports before release.

## Open questions

- The exact gradient angle for seek/volume fills is not encoded in the PNGs; a left-to-right (`90deg`) gradient matches the observed appearance.
- The volume level in `Player.png` uses a green fill that is outside the core palette; decide whether it becomes a semantic `--success` token.
- The nine accent swatches need exact sampled values and a contrast check before alternate themes ship.
- Window chrome is drawn in the exports; on Linux/macOS/Windows the native decorations may differ. Decide between custom decorations and native chrome during implementation.
