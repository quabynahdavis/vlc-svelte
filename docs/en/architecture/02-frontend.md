# Frontend Architecture

**Status:** the application shell and core UI components are implemented; library→player navigation, remaining settings panes and persistence are planned. Last updated 2026-10-26.

## Entry point

`index.html` contains `<div id="app">` and loads `/src/main.ts`. `src/main.ts` imports `App.svelte` and mounts it on `#app`.

`src/app.css` contains the three Tailwind directives plus base rules: `html`/`body`/`#app` fill the window, `body` uses the Inter-first sans stack on `#0E0E0E`, colour scheme is dark, native text selection is disabled for shell chrome and re-enabled for inputs, and thin custom scrollbars are applied. Font loading of Inter itself is still planned.

## Application shell (`src/App.svelte`)

- `<TitleBar onSettings={...} />` sits above the body in a 40 px strip.
- `<IconRail active={...} onSelect={...} />` is a fixed 64 px left rail; `activeNav` is local state.
- `<main>` switches views:
  - `home` → `PlayerView` (player stage, playlist and transport);
  - `videos` → `LibraryView` (breadcrumb toolbar and media grid);
  - every other rail destination → a "Coming soon" placeholder.
- A 400 px property dock renders `<PropertyPanel>` when the `propertiesPanel` store is true. `propertyPreset` selects the compressor or video-adjustment preset, and the panel title switches between "Collapse Settings" and "Video Effects".
- An optional 288 px details aside is gated by `showRightPanel`; nothing currently sets it to true.
- `<SettingsModal onClose={...} />` renders as an overlay when `showSettings` is true.
- `<ContextMenu>` is mounted at shell level, positioned from the `contextMenu` store. Right-clicking `<main>` opens it. `handleMenuAction` maps menu ids to player actions (`play-pause`, `stop`, `previous-item`, `next-item`, `hide-ui`, volume, mute), property-panel presets (`effects-*`) and `quit`; unimplemented entries are no-ops.
- `hideChrome` toggles the `chrome-hidden` class, which hides the title bar and icon rail.

There is no URL router; `activeNav` and `showSettings` are lost on reload.

## Views

### Player view (`src/views/PlayerView.svelte`)

**Implemented**

- A 300 px `PlaylistPanel` on the left, shown by default. On narrow windows it overlays the stage above the transport; on `lg` and wider it is a static column.
- A video stage that renders `<video>` from `$currentTrack?.src` when the player queue has a track; otherwise an empty state with the VLC cone and "No media loaded".
- Media-element listeners keep `player` state in sync: `loadedmetadata`, `durationchange`, `timeupdate`, `play`, `pause`, `ended`, `progress` and `error`. Buffered ratio is derived from `video.buffered`.
- Playback state drives `video.play()` / `pause()`; volume and mute are applied to the element.
- `TransportBar` receives the video element, media availability, buffered ratio, playlist state, the stage as fullscreen target and callbacks for playlist and settings.
- Automatic next-track advance on `ended` unless repeat/shuffle logic chooses otherwise.
- Scoped CSS for the `:fullscreen` stage.

**Known gaps**

- No media is queued at startup, so the default screen is the empty state.
- External sources are accepted through the `src` prop but nothing uses that path yet.
- The playlist panel content is static; playlists and track rows are not wired to the queue.

### Library view (`src/views/LibraryView.svelte`)

- `LibraryToolbar` receives the breadcrumb, filtered item count and search query; typing updates `searchQuery`.
- A responsive grid (2 columns on mobile, up to 5 at `xl`) of `MediaCard` tiles.
- Empty state distinguishes "no results for the query" (`SearchX`) from an empty folder (`Film`).
- `handleSelect` is a no-op: selecting a card does not open the player or change the queue yet.

### Settings view (`src/views/SettingsView.svelte`)

Legacy scaffold: a light-themed card with static "Dark mode", "Hardware acceleration", "Default volume" and "About" controls. It is **not imported or mounted** by `App.svelte`; `SettingsModal` supersedes it. It should be deleted or converted when the settings work is finalised.

## Settings modal (`src/components/SettingsModal.svelte`)

A full-window modal (not a centred card) with a dimmed app backdrop and a `12px`-radius panel on `#0E0E0E`.

- Search field filters category labels; no result shows a "No settings found" message.
- Category groups: **App** (General, Interface, Privacy, Controls), **Media** (Playback, Video, Audio, Subtitles, Library) and **System** (Network, Performance, Recording, Extensions).
- **Implemented panes:** `GeneralPanel` (appearance, theme segmented control, accent swatches, startup, diagnostics), `AudioPanel` (output, equalizer, spatial audio) and `SubtitlesPanel` (defaults, synchronisation, appearance, advanced).
- **Planned panes:** Interface, Privacy, Controls, Playback, Video, Library, Network, Performance, Recording and Extensions render `PlaceholderPanel` ("Settings coming soon").
- Escape closes the modal; `onClose` and optional `bind:open` are supported.

## Component library

| Component | File | Notes |
| --- | --- | --- |
| `TitleBar` | `src/components/TitleBar.svelte` | VLC cone, centred title, settings button, Tauri window controls. |
| `IconRail` | `src/components/IconRail.svelte` | Nav items from `lib/constants.ts`; active accent bar. |
| `PlaylistPanel` | `src/components/PlaylistPanel.svelte` | Header, search, playlist list, track list, back event. |
| `TransportBar` | `src/components/TransportBar.svelte` | Playback controls, seek, volume, fullscreen, playlist toggle, settings. |
| `LibraryToolbar` | `src/components/LibraryToolbar.svelte` | Breadcrumb, count, search, sort and view buttons. |
| `MediaCard` | `src/components/MediaCard.svelte` | 16:9 poster, title, progress bar. |
| `SettingsModal` | `src/components/SettingsModal.svelte` | Modal shell, search, category navigation. |
| `ContextMenu` | `src/components/ContextMenu.svelte` | Nested menu data, submenus, shortcuts, viewport clamping. |
| `PropertyPanel` | `src/components/PropertyPanel.svelte` | Collapsible sections; exports `compressorPreset` and `videoPreset`. |
| `PropertySlider` | `src/components/PropertySlider.svelte` | Tick-marked range with formatted value. |

Settings primitives under `src/components/settings/`: `Section`, `SettingRow`, `Toggle`, `Slider`, `Segmented`, `Select`, `TextInput`, `ColorField`, `Swatch`, `GeneralPanel`, `AudioPanel`, `SubtitlesPanel`, `PlaceholderPanel`.

## File tree

```
src/
├── components/
│   ├── TitleBar.svelte
│   ├── IconRail.svelte
│   ├── PlaylistPanel.svelte
│   ├── TransportBar.svelte
│   ├── LibraryToolbar.svelte
│   ├── MediaCard.svelte
│   ├── ContextMenu.svelte
│   ├── PropertyPanel.svelte
│   ├── PropertySlider.svelte
│   ├── SettingsModal.svelte
│   └── settings/
│       ├── GeneralPanel.svelte
│       ├── AudioPanel.svelte
│       ├── SubtitlesPanel.svelte
│       ├── PlaceholderPanel.svelte
│       ├── Section.svelte
│       ├── SettingRow.svelte
│       ├── Toggle.svelte
│       ├── Slider.svelte
│       ├── Segmented.svelte
│       ├── Select.svelte
│       ├── TextInput.svelte
│       ├── ColorField.svelte
│       └── Swatch.svelte
├── lib/
│   ├── constants.ts          # Nav ids, labels and rail items
│   └── mock.ts               # MediaItem type, breadcrumb and show data
├── stores/
│   ├── player.ts             # Queue, playback, volume, repeat/shuffle
│   ├── library.ts            # Breadcrumb, items, search and filtered items
│   ├── settings.ts           # Field-level settings stores, EQ bands, accents
│   └── ui.ts                 # Context-menu position/visibility, property dock
├── views/
│   ├── PlayerView.svelte
│   ├── LibraryView.svelte
│   └── SettingsView.svelte   # Legacy scaffold, not mounted
├── App.svelte
├── app.css
└── main.ts
```

## State and data

- **`stores/player.ts`** — `player` writable holds `queue`, `currentIndex`, `isPlaying`, `currentTime`, `duration`, `volume`, `muted`, `repeat` and `shuffle`; `currentTrack` is derived. Helpers: `playAt`, `next`, `prev`, `toggle`, `seek`, `setVolume`, `toggleMute`. The `<video>` element remains the source of truth for time/duration; the view writes element events back into the store.
- **`stores/library.ts`** — `breadcrumb`, `libraryItems`, `searchQuery` and derived `filteredItems` (case-insensitive title filter). Demo data comes from `lib/mock.ts`.
- **`stores/settings.ts`** — field-level writables (`interfaceLanguage`, `theme`, `accentColor`, startup and diagnostics flags) plus `EQ_BANDS` and `ACCENT_COLORS`; designed for `bind:value={$settings.field}`.
- **`stores/ui.ts`** — `contextMenu` (open/x/y), `propertiesPanel` and the `openContextMenu` / `closeContextMenu` helpers.
- **`lib/constants.ts`** — `NavId`, `RailItemId`, `NAV_ITEMS`, `ADD_ITEM` and `NAV_LABELS`.
- **`lib/mock.ts`** — `MediaItem` shape plus the demo breadcrumb and show list used by the library.

No Tauri `invoke` calls or persistence exist yet. The only Tauri API usage is dynamic import of `@tauri-apps/api/window` for window actions and quit; it degrades to a console warning in the browser.

## Styling conventions

Canonical colour, typography, radius and spacing values live in [../design/01-design-system.md](../design/01-design-system.md). Do not introduce new hex values in components; add a token instead.

| Concern | Current code | Target |
| --- | --- | --- |
| Approach | Inline Tailwind utilities plus small scoped `<style>` blocks for range inputs/fullscreen | Keep utility-first; extract repeated patterns |
| Global CSS | Full-height root, dark colour scheme, Inter stack, scrollbar styling | Add self-hosted Inter and base focus styles |
| Theme | Dark shell using `vlc.*` utilities, but with interim config values and literal hexes | Measured palette: app `#0E0E0E`, panel `#181818`, panel alt `#191919`, card `#1B1B1B`, raised `#232323` |
| Accent | `vlc-orange` (`#F08A1C` interim) and literal `#D37918` in newer components | `#D37918`, pressed `#AB6314`, fill start `#371F06`; gradient `90deg` |
| Text | `vlc.text` (`#FFFFFF` interim) and literals `#EAEAEA`, `#B8B8B8`, `#8F8F8F`, `#6B6B6B` | `#EAEAEA` primary, `#B8B8B8` secondary, `#8F8F8F` muted, `#6B6B6B` dim |
| Borders | `vlc-border` (`#262626` interim); literals `#373737` and `#262626` | `#373737` structural, `#262626` subtle |
| Typography | Inter first in the stack; font files not bundled | Self-host Inter |
| Design tokens | `tailwind.config.js` has a first-pass `vlc.*` palette | Align to the target table in the design document |
| Icons | `lucide-svelte` PascalCase imports, 1.6–2 px strokes | Same library, consistent line style |
| Radii | `rounded-panel` / `rounded-control` / `rounded-input` plus literals | `12px` panels, `8px` controls, `6px` inputs |

Contributing conventions:

- Use `<script lang="ts">` in every component; TypeScript is preprocessed by `svelte-preprocess`.
- `tsconfig.json` enables `strict` and `verbatimModuleSyntax`; use `import type { ... }` for type-only imports.
- Component files: PascalCase; top-level screens use the `View` suffix; state and functions in camelCase.
- Prefer small components over growing views.
- Every icon-only button needs an accessible name; visible focus states are required.
- Do not add a runtime font-CDN dependency.

## Known gaps

| Gap | Detail |
| --- | --- |
| Library selection is inert | `LibraryView.handleSelect` does not enqueue media or navigate to the player. |
| No startup media | The player queue is empty, so the app opens on the empty state. |
| Static playlist | Playlist names/tracks are hard-coded in `PlaylistPanel.svelte`. |
| Placeholder settings | Ten categories render `PlaceholderPanel`; only General, Audio and Subtitles are built. |
| No persistence | Settings and playback state reset on reload; no Tauri store or file configuration. |
| Details panel unreachable | `showRightPanel` is never set to true. |
| Legacy view | `SettingsView.svelte` is unused and still light-themed. |
| Token drift | `tailwind.config.js` and literal hex values do not yet match the measured palette. |
| Backend integration | No commands, plugins, capabilities or CSP; window calls are the only Tauri usage. |
| No tests | No unit, component or end-to-end test setup. |
