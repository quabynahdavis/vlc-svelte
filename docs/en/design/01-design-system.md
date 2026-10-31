# Design System

**Status:** implemented. The semantic token set, dual dark/light themes and runtime accent theming live in `src/app.css`, `tailwind.config.js` and `src/lib/theme.ts`. The PNG exports remain the visual reference for the dark palette and component proportions. Last updated 2026-10-31.

This document is the canonical token reference for the Kanea UI. The source exports are the **25 PNG files** in `VLC Redesign (Community)/` at the repository root. They were created by [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) for her VLC redesign concept and are used as visual reference only. Rebuild the interface in Svelte and Tailwind; never embed the exports as application UI.

## Source of truth

- The 25 PNGs are authoritative for the dark palette, spacing, type and component states.
- `VLC Redesign (Community).svg` (~30 MB) is **not** a vector master with extra data. It is a collage of the same 21 screen images already exported as PNGs. Do not mine it for additional measurements; use the PNGs.
- The light palette is a project extension, not part of the original exports. It is defined in `src/app.css` and must follow the same semantic roles.

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

## Token architecture

The application uses one semantic token layer, exposed as CSS custom properties and consumed by Tailwind. Components must reference semantic tokens, not raw hex values.

1. `src/app.css` declares the **dark palette** on `:root` and on `:root[data-theme='dark']`, so the first frame is correct before JavaScript runs.
2. `:root[data-theme='light']` overrides every surface, border, text, danger, scrollbar and shadow token. The accent ramp variables are shared.
3. Every colour has an `-rgb` companion (`--bg-app-rgb: 14 14 14`) so Tailwind opacity modifiers such as `bg-vlc-app/95` and `border-vlc-border/30` keep working.
4. `src/lib/theme.ts` resolves `dark`, `light` or `system`, sets `data-theme`, `data-theme-preference` and `color-scheme`, and overrides the accent variables at runtime.
5. `index.html` contains a pre-paint script that reads `vlc.settings.v1` and applies `data-theme` before the stylesheet paints, preventing a dark-to-light flash.

`data-theme` always holds the **resolved** palette (`dark` or `light`). `data-theme-preference` keeps the user's choice (`dark`, `light` or `system`). When the preference is `system`, `theme.ts` follows `prefers-color-scheme` changes while the app is running.

## Semantic token set

| Token | Tailwind | Dark | Light | Role |
| --- | --- | --- | --- | --- |
| `--bg-app` | `vlc.app` | `#0E0E0E` | `#F4F4F1` | Application background, title bar, transport base, view canvas. |
| `--bg-panel` | `vlc.panel` | `#181818` | `#FFFFFF` | Icon rail, playlist panel, dock, settings sidebar, floating menu. |
| `--bg-panel-alt` | `vlc.panel-alt`, `vlc.panelAlt` | `#191919` | `#FAFAF8` | Adjacent or secondary panel surface. |
| `--bg-card` | `vlc.card` | `#1B1B1B` | `#FFFFFF` | Cards, grouped settings surfaces, inputs, raised content blocks. |
| `--bg-raised` | `vlc.raised` | `#232323` | `#ECECE8` | Hovered or selected rows, elevated controls, toggle tracks. |
| `--border` | `vlc.borderStrong` | `#373737` | `#D6D6D0` | Visible panel, menu and input edge. |
| `--border-subtle` | `vlc.border`, `vlc.borderSubtle` | `#262626` | `#E6E6E1` | Hairline dividers and low-contrast outlines. |
| `--text-primary` | `vlc.text` | `#EAEAEA` | `#1B1B19` | Headings, active labels, numeric values, primary content. |
| `--text-secondary` | `vlc.secondary` | `#B8B8B8` | `#4B4B47` | Setting labels, inactive tabs, menu labels, descriptions. |
| `--text-muted` | `vlc.muted` | `#8F8F8F` | `#6F6F69` | Metadata, inactive icons, placeholders. |
| `--text-dim` | `vlc.dim` | `#6B6B6B` | `#8C8C86` | Shortcut hints, captions and other non-essential text. |
| `--danger` | `vlc.danger` | `#E81123` | `#C4141F` | Destructive actions and error text. |
| `--accent` | `vlc.orange` | `#D37918` | `#D37918` | Primary action, active navigation, progress fill, slider thumb, focus ring. |
| `--accent-pressed` | `vlc.orangeDark`, `vlc.orange-dark` | `#AB6314` | `#AB6314` | Pressed state and darker accent companion. |
| `--accent-deepest` | `vlc.orangeDeep` | `#371F06` | `#371F06` | Deep amber at the start of accent gradients. |
| `--accent-ink` | `vlc.orangeText`, `vlc.orange-text` | `#D37918` | `#A0520B` | Accent-coloured **text and icons**; darkened in light mode for contrast. |
| `--selection-ink` | — | `#0E0E0E` | `#1B1B19` | Text/icon colour on an accent-filled surface. |
| `--scrollbar-thumb` | — | `#373737` | `#C7C7C1` | Thin scrollbar thumb. |
| `--scrollbar-thumb-hover` | — | `#6B6B6B` | `#9E9E97` | Scrollbar thumb on hover. |
| `--shadow-color` | — | `rgb(0 0 0 / 0.55)` | `rgb(27 27 25 / 0.14)` | Floating menus, modals and the right dock. |

### Dark palette

Near-black application surface with a five-step neutral ramp: `#0E0E0E` app → `#181818` panel → `#191919` panel alt → `#1B1B1B` card → `#232323` raised. Visible edges are `#373737`; internal hairlines are `#262626`. Text runs from `#EAEAEA` primary to `#6B6B6B` dim. The default accent is VLC orange `#D37918`, with `#AB6314` pressed and `#371F06` deepest.

### Light palette

Warm-neutral paper rather than cold pure grey: `#F4F4F1` app, `#FFFFFF` panel and card, `#FAFAF8` panel alt, `#ECECE8` raised. Borders are `#D6D6D0` visible and `#E6E6E1` subtle. Text runs from `#1B1B19` primary to `#8C8C86` dim. `--danger` is darkened to `#C4141F`, and `--accent-ink` is `#A0520B` so orange text and icons stay legible on every light surface. Accent **fills** keep the user's chosen accent value.

## Accent theming

- The default accent is `#D37918`. `ACCENT_COLORS` in `src/stores/settings.ts` exposes ten swatches: orange, red, gold, green, teal, blue, indigo, purple, pink and grey.
- `accentPalette()` in `src/lib/theme.ts` derives the full ramp from one hex value: pressed at `0.81` brightness, deepest at `0.26`, and `linear-gradient(135deg, pressed, accent)`.
- `applyAppearance()` writes `--accent`, `--accent-rgb`, `--accent-pressed`, `--accent-pressed-rgb`, `--accent-deepest`, `--accent-deepest-rgb` and `--accent-gradient` on `document.documentElement`. Tailwind's `vlc.orange*` utilities follow automatically.
- Persisted and imported accent values are validated as `#RRGGBB` and normalised to uppercase; invalid values fall back to the default.
- In light mode, use `vlc-orangeText` / `--accent-ink` for accent text and line icons, and `vlc-orange` for fills and solid controls. Do not use `--accent` directly for small text on light surfaces.

## Tailwind mapping

`tailwind.config.js` maps every `vlc.*` colour to a CSS variable rather than a literal value.

| Config key | Resolves to | Notes |
| --- | --- | --- |
| `vlc.app` | `--bg-app-rgb` | Application surface. |
| `vlc.panel` | `--bg-panel-rgb` | Primary panel. |
| `vlc.panel-alt`, `vlc.panelAlt` | `--bg-panel-alt-rgb` | Aliases for the same token. |
| `vlc.card` | `--bg-card-rgb` | Cards and inputs. |
| `vlc.raised` | `--bg-raised-rgb` | Hover/selected surface. |
| `vlc.border` | `--border-subtle-rgb` | **Legacy hairline name**; kept so existing dark styling is unchanged. |
| `vlc.borderStrong` | `--border-rgb` | Visible edge. Prefer this for new work. |
| `vlc.borderSubtle` | `--border-subtle-rgb` | Explicit hairline alias. |
| `vlc.text` | `--text-primary-rgb` | Primary text. |
| `vlc.secondary` | `--text-secondary-rgb` | Secondary text. |
| `vlc.muted` | `--text-muted-rgb` | Muted text. |
| `vlc.dim` | `--text-dim-rgb` | Dim text. |
| `vlc.danger` | `--danger-rgb` | Destructive/error. |
| `vlc.orange` | `--accent-rgb` | Accent fills and solid controls. |
| `vlc.orangeDark`, `vlc.orange-dark` | `--accent-pressed-rgb` | Pressed accent. |
| `vlc.orangeDeep` | `--accent-deepest-rgb` | Gradient start. |
| `vlc.orangeText`, `vlc.orange-text` | `--accent-ink` | Accent text/icons (not opacity-aware). |
| `backgroundImage.vlc-accent` | `--accent-gradient` | `135deg`, pressed → accent. |

Radii are `rounded-panel` (`12px`), `rounded-control` (`8px`) and `rounded-input` (`6px`). The sans stack starts with `Inter`; `index.html` currently loads Inter from Google Fonts, so self-hosting remains an open task.

## Shape, spacing and elevation

The shape language is **rectangular but softened**: controls keep a clear rectangular footprint with small corner radii. Pills and circles are reserved for elements that are semantically round.

| Token | Value | Applies to |
| --- | --- | --- |
| Panel radius | `12px` | Modals, cards, context menu, dock cards, floating surfaces. |
| Control radius | `8px` | Buttons, menu rows, tabs, segmented controls, icon buttons. |
| Input radius | `6px` | Text fields, selects, number inputs, colour fields. |
| Compact row radius | `6px` | Dense list and compact-view rows. |
| Border width | `1px` | Panel and input outlines, dividers. |
| Spacing grid | 4 px base; 8/12/16/24/32 px steps | Padding and gaps. |
| Panel padding | 24–32 px | Modal body and cards. |
| Row height | 40–48 px; 32–40 px compact | Settings rows, menu items, list rows. |
| Elevation | Surface step plus `--shadow-color` only for floating overlays | Menus, modals, right dock. |

Toggles, slider thumbs, status chips and the volume cone are fully rounded or geometric exceptions. Do not wrap ordinary buttons in pill shapes, and do not use shadows to separate in-flow surfaces — use the surface steps.

## Iconography

- Icons come from `lucide-svelte` as PascalCase line icons, typically `1.6–1.8` stroke width at 16–20 px.
- **Interactive controls are monochrome.** Transport, toolbar, rail and dock icons inherit `vlc-secondary`, brighten to `vlc.text` on hover, and use `vlc-orangeText` for the active/pressed state. State is conveyed by the control surface and `aria-pressed`, not by a second icon colour.
- **Decorative menu icons may be two-tone.** The exports include two-tone disc and UI glyphs. In the context menu, `tone: 'accent'` rows use `vlc-orangeText` and neutral rows use `vlc.muted`; true two-tone glyph rendering is not implemented yet. Do not apply two-tone treatment to transport or form controls.
- Play/pause glyphs are filled; most other icons are stroked. Keep that exception limited to media transport.
- Every icon-only button needs an accessible name (`aria-label` or visible text) and a visible focus ring.

## Component application

### Shell

`App.svelte` stacks an optional 40 px custom title bar above a horizontal body: icon rail, main view and optional property dock. The title bar is omitted when `useSystemTitleBar` is on. Settings open as a full-window overlay; the consolidated menu, welcome screen and add-to-playlist dialog are mounted at shell level. Rail order and dock-tab order come from the layout store.

### Title bar

40 px bar on `--bg-app` with the VLC cone at the left, a centred `Kanea` label in `--text-secondary`, a menu button and minimise/maximise/close controls at the right. Window buttons are 46 px wide, 40 px tall; close hovers to `--danger`. Source: `Player.png`.

The menu button opens the full consolidated menu anchored under it; right-click elsewhere opens the shorter playback menu. Both use the same floating-card styling as the context menu below.

### Icon rail

64 px collapsed / 200 px expanded vertical rail on `--bg-app`, with line icons and tooltips. The active item uses `--accent-ink` plus a raised/card surface; inactive icons use `--text-dim` and brighten to `--text-secondary` on hover.

### Playlist panel

300 px panel on `--bg-panel` with a 44 px header, queue count, search/sort/grid actions and the live player queue. The selected queue row uses `--bg-raised`; metadata uses `--text-muted`.

### Transport bar

52 px strip on `--bg-app` with a top border. Left to right: previous, a larger accent play/pause button (36 × 40 px, 18 px glyph), next, elapsed time, seek bar, total duration, next-episode button, mute plus volume cone, divider, then audio, subtitles, settings, fullscreen and queue controls. The right-hand controls follow the layout store; previous/play/next, elapsed time and the seek bar are always present.

- The seek bar is a thick 6 px track that grows to 8 px on hover/focus, with a buffered segment and an accent progress fill. Hovering shows a 128 px-wide frame preview card backed by a 160 × 90 canvas, plus a timestamp.
- Volume is a 92 px triangular cone: the accent fill follows the volume level and a small thumb marks the position.
- Timers use 11 px monospace tabular figures in `--text-secondary`.
- In the last 20 seconds of a playable queue item, a compact **Next** button appears before the volume group. A full next-episode prompt is still a vision item.

### Fullscreen player

Fullscreen targets a shell that wraps both the video stage and the transport, so the controls stay mounted instead of being re-created.

- A top overlay shows the media title, a library button, a picture-in-picture toggle when the browser supports it, and an exit-fullscreen button.
- The transport is overlaid at the bottom on a dark gradient; its opaque surface and top border are removed so the video reads through.
- Top and bottom chrome auto-hide after 2.5 seconds. Pointer movement, focus inside the chrome, or a key press reveals them; a focused control is never hidden.
- Hidden chrome is `inert` and `aria-hidden`, and the transitions are disabled under `prefers-reduced-motion`.
- The fullscreen shell pins the dark palette even when the application is in light mode, because it always sits over black video.

### Compact library overlay

A 420 px drawer on `--bg-panel/95` with a backdrop blur, a hairline right border and a strong shadow. It overlays the stage on the left without unmounting the player. The header carries the title, count, breadcrumb and add-media menu; below it sit a search field, watched filter and sort control. Rows are 56 px thumbnails with title, episode code, duration, watched marker and an accent progress hairline. Dragging a row uses the shared track payload; dropping it on the playlist panel adds to the queue.

### Layout editor

Settings → Layout uses bordered `--bg-card` rows with a drag handle, label and up/down buttons. The drop target uses an accent border and `--bg-raised`. Player-control rows pair a label/description with the shared 22 px toggle. A reset button sits in a bordered footer.

### Library toolbar and media views

Toolbar is 64 px high with back, clickable breadcrumb buttons (`ChevronRight` separators), live item count, search, a watched-status filter, sort menu, shared view-mode toggle and the add-media menu. Grid uses responsive 16:9 `MediaCard` tiles; list and compact use `MediaListRow`. Cards use `--bg-card` with a dark poster gradient, `--border` hairline, hover `--bg-raised`, and an accent progress hairline. Hovering a card or row reveals two monochrome icon buttons for **Add to queue** and **Add to playlist**; the same items can be dragged onto the queue.

### Right dock

340 px panel on `--bg-panel` with a 52 px header. Tabs are compact: inactive tabs show only an 18 px icon in a 40 px slot; the active tab expands to icon plus label with an accent underline. Horizontal chevrons appear only when the tab strip overflows; `ArrowLeft`/`ArrowRight`/`Home`/`End` move between tabs.

### Settings modal

Full-window overlay on `--bg-app/95` with a `12px` panel. Header holds a 300 px search field; the 300 px category sidebar uses `--bg-panel`; the content pane scrolls on `--bg-app`. Active categories use `--bg-card` and `--text-primary`; inactive labels use `--text-secondary`; group headings use `--text-muted`. All sixteen categories are implemented, including **Layout** and **Profiles**.

### Context menu

Floating `300px` card on `--bg-panel` with `12px` radius, `1px --border` edge and a shadow. Rows are 44 px, combine an icon, a `--text-secondary` label and a right-aligned `--text-muted` shortcut; hover/focus uses `--bg-raised`. Submenus open as fixed flyouts and flip near the viewport edge. The title-bar menu uses the full tree; the right-click variant is shorter and keeps playback plus **Hide UI**.

### Property panel and slider

Docked 400 px panel on `--bg-app` with collapsible sections and repeated label + numeric value + full-width slider rows. Rows use `--text-secondary`/`--text-primary`, `--border-subtle` tracks and `--accent` fill; the thumb is light with an accent halo.

## Accessibility and contrast

- **Focus:** 2 px accent ring with a 2 px offset; never remove focus outlines. On light surfaces the ring may use `vlc-orange` at reduced opacity.
- **Hover:** move one surface step up (`--bg-card` → `--bg-raised`) and brighten text; do not change text colour alone.
- **Pressed:** use `--accent-pressed` for accent controls; do not darken neutral panels below `--bg-app`.
- **Disabled:** keep the shape, reduce opacity, and use `--text-dim`; do not rely on colour alone.
- **Toggles:** expose `role="switch"` / `aria-checked` and keep the visible `ON` / `OFF` label.
- **Tabs:** use `role="tab"` / `aria-selected`; the accent underline must not be the only active signal.
- **Sliders:** use `role="slider"` or a native range input with keyboard support and a text value.
- **Contrast:** `--text-primary` and `--text-secondary` pass on both neutral ramps. Reserve `--text-muted` for metadata and `--text-dim` for non-essential hints. In light mode, accent text/icons must use `--accent-ink` (`#A0520B`, at least 4.78:1 on every light surface); `--danger` is darkened to about 5.5:1.
- **Text on accent:** use `--selection-ink` (near-black in both themes), not white.
- **Motion:** keep transitions short (120–160 ms) and respect `prefers-reduced-motion`.

## Intentional dark exceptions

These surfaces stay dark in both themes. They frame media and must not wash out colour judgement:

- **Video stage:** `bg-black`; the fullscreen shell is `#000000` and pins the dark palette.
- **Volume HUD:** `black/80` with white text, accent icon and accent level bar.
- **Fullscreen chrome:** top and bottom overlays use black gradients and white text regardless of theme.
- **Thumbnails and posters:** the media-card placeholder uses a `#1B1B1B → #0E0E0E` gradient; the seek-preview card uses a black frame and `--bg-panel/95` shell.
- **Visualizer canvas:** hard-coded `#121212 → #0A0A0A` gradient with accent bars.

These are the only places where literal dark values are acceptable. Everything else must resolve through `data-theme` tokens.

## Implementation checklist

- [x] Define semantic surface, border, text, danger, accent-ink, scrollbar and shadow tokens.
- [x] Implement the dark and warm-neutral light palettes with `-rgb` companions.
- [x] Apply theme and accent at runtime, including system-theme following and pre-paint resolution.
- [x] Migrate shell, views, settings and dock panels to semantic tokens.
- [x] Implement custom/system title bar switching.
- [x] Implement per-scope grid/list/compact view modes.
- [x] Persist settings and view modes.
- [ ] Render true two-tone decorative menu glyphs.
- [ ] Self-host Inter instead of loading it from Google Fonts.
- [ ] Audit every remaining literal hex value and light-theme contrast pair.
- [ ] Replace placeholder Tauri icons with project branding.
- [ ] Verify all states at 1200 × 800 against `Player.png` and `Settings - global.png`.

## Open questions

- Alternate accent swatches share the same derivation, but only the default orange has been contrast-audited in light mode.
- The two-tone icon exports need a vector source before they can replace the current single-tone menu icons.
- Native window chrome differs by OS; the custom title bar is the designed default and the system title bar is an accessibility/fallback option.
