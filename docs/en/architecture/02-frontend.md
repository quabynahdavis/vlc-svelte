# Frontend Architecture

**Status:** current views are implemented as scaffolds; the component/store structure is planned. Last updated 2026-10-26.

## Entry point

`index.html` contains `<div id="app">` and loads `/src/main.ts`. `src/main.ts` imports `App.svelte`, instantiates it with `new App({ target: document.getElementById('app')! })`, and exports the instance.

`src/app.css` contains the three Tailwind directives and a system font stack on `body`; it does not set full-height layout rules for `html`, `body` or `#app`.

## Application shell (`src/App.svelte`)

- Local state: `let view: 'player' | 'settings' = 'player'`.
- A top navigation bar (light gray, `h-12`, bottom border, shadow) shows the "VLC Redesign" wordmark and two buttons, **Player** and **Settings**. Clicking a button assigns `view`; the active button gets a gray background.
- `<main class="flex-1 overflow-hidden flex">` conditionally renders `<PlayerView />` or `<SettingsView />` with `{#if}`.
- `onMount` and `invoke` from `@tauri-apps/api/core` are imported, but `onMount` only contains a comment (`// Placeholder for future Tauri command checks`) and `invoke` is unused.
- There is no URL routing despite the `svelte-routing` dependency; view state is lost on reload.
- Because the app root is not a flex column with a defined height, the `flex-1` classes do not currently guarantee a full-window layout.

## Player view (`src/views/PlayerView.svelte`)

**Implemented**

- A full-bleed `<video>` element with `controls`, `autoplay`, `muted`, and a remote sample source (`BigBuckBunny.mp4` from `commondatastorage.googleapis.com`).
- A centered circular play overlay (lucide `Play`) shown while `isPlaying` is false.
- A bottom gradient control strip containing:
  - play/pause toggle (`Play` / `Pause` icons);
  - a maximize button with an empty handler;
  - a seek bar drawn with a fixed `w-[30%]` fill;
  - elapsed/total time labels computed from `currentTime` and `duration`;
  - a mute toggle (`Volume2` / `VolumeX`);
  - a volume bar drawn with a fixed `w-[80%]` fill;
  - a second maximize button with no handler.
- Local state: `isPlaying = false`, `volume = 80`, `isMuted = false`, `currentTime = 0`, `duration = 0`.

**Known gaps (all call for planned work)**

| Gap | Detail |
| --- | --- |
| Playback state is disconnected | `togglePlay()` only flips `isPlaying`; it never calls `video.play()` / `video.pause()`. The video autoplays muted behind the overlay, so the icon can contradict actual playback. |
| Time never updates | No `timeupdate`, `loadedmetadata` or `durationchange` listeners; the labels stay at `0:00 / 0:00`. |
| Fixed progress and volume | `w-[30%]` and `w-[80%]` are hard-coded; `volume` is not bound to the media element or the bar. |
| Mute is cosmetic | `toggleMute()` flips the icon only; it does not change `video.muted`. |
| Fullscreen is a no-op | Both maximize buttons lack a fullscreen implementation. |
| Native + custom controls | `controls` is enabled while a custom bar is also rendered, producing two control surfaces. |
| Unused lookup | `const videoEl = document.querySelector('video')` runs at component initialization (before the element is mounted) and is never used; a bound element reference is needed. |
| Remote dependency | The sample video requires network access and is not local media. |
| Unused import | `X` is imported from `lucide-svelte` but not rendered. |
| No keyboard/ARIA | Icon-only buttons have no `aria-label`; no keyboard shortcuts are handled. |

## Settings view (`src/views/SettingsView.svelte`)

**Implemented**

- Centered, max-width card (`p-8 max-w-md`) with a "Settings" heading.
- "Dark mode" toggle (unchecked, no binding, no theme effect).
- "Hardware acceleration" toggle (`checked` attribute, no binding).
- "Default volume" range input (`0–100`, no value binding).
- "About" section: `VLC Redesign (Community) · Tauri + Svelte`.

The view has an empty `<script lang="ts"></script>` and no Tauri calls, stores or persistence. None of the controls affect the application.

## Planned frontend structure

These directories do **not** exist yet; names are indicative and should be confirmed during implementation.

```
src/
├── components/               # planned
│   ├── player/               # PlayerSurface, ControlBar, SeekBar, VolumeControl
│   ├── menu/                 # ContextMenu, MenuItem, Submenu
│   ├── settings/             # SettingsModal, SettingsSidebar, ToggleRow, SliderRow, Equalizer
│   └── ui/                   # IconButton, Toggle, Slider, ColorSwatch
├── lib/                      # planned
│   ├── tauri.ts              # typed invoke() wrappers
│   ├── format.ts             # time/duration formatting
│   └── types.ts              # MediaEntry, MediaMetadata, Settings
├── stores/                   # planned
│   ├── player.ts             # current media, playing, time, duration, volume, muted, fullscreen
│   └── settings.ts           # theme, accent, language, default volume, hardware acceleration
├── views/                    # existing
│   ├── PlayerView.svelte
│   └── SettingsView.svelte
├── App.svelte
├── app.css
└── main.ts
```

Planned responsibilities:

- **`stores/player.ts`** — Svelte `writable` stores for playback state and the selected media item; the video element remains the source of truth for time/duration via event listeners.
- **`stores/settings.ts`** — user preferences shown in the settings modal; persistence is planned (mechanism not chosen).
- **`lib/tauri.ts`** — one typed wrapper per Rust command; components should not call `invoke` directly.
- **`components/ui/`** — shared controls so the player, menu and settings use the same toggle/slider/icon-button styling.

## Styling conventions

Canonical colour, typography, radius and spacing values live in [../design/01-design-system.md](../design/01-design-system.md). Do not introduce new hex values in components; add a token instead.

| Concern | Current code | Target (from references) |
| --- | --- | --- |
| Approach | Inline Tailwind utility classes; no scoped `<style>` blocks | Keep utility-first; extract repeated patterns into components |
| Global CSS | Tailwind directives + `body` margin/font only | Add full-height root rules, theme variables and base focus styles |
| Theme | Light gray nav (`gray-50`) + black player + blue accents (`blue-600`) | Dark surfaces: app `#0B0B0B`, sidebar `#111111`, cards `#1A1A1A`, raised `#232323` |
| Accent | `blue-600` | VLC orange `#F08A1C`; amber gradient fill `#A85A0F → #F08A1C`; purple/pink/blue variants in the player references |
| Text | Default Tailwind grays | Primary `#FFFFFF`, secondary `#B8B8B8`, muted `#7A7A7A` |
| Borders | Default gray borders | `#262626` |
| Typography | System font stack | **Inter** (self-hosted); adding it is planned |
| Design tokens | `tailwind.config.js` has an empty `theme.extend` | Colour, radius and spacing tokens per [../design/01-design-system.md](../design/01-design-system.md) |
| Icons | `lucide-svelte` PascalCase imports | Same library; keep icons consistent with the line style in the references |
| Radii | `rounded-md` / `rounded-lg` | `12px` panels, `8px` controls, `6px` inputs |

Additional conventions to follow when contributing:

- Use `<script lang="ts">` in every component; TypeScript is preprocessed by `svelte-preprocess` (configured in `vite.config.ts`).
- `tsconfig.json` enables `strict` and `verbatimModuleSyntax`; use `import type { ... }` for type-only imports.
- Component files: PascalCase, `View` suffix for top-level screens; state and functions in camelCase.
- Prefer small components over growing `PlayerView.svelte` / `SettingsView.svelte`.
- Every icon-only button needs an accessible name; visible focus states are required.
