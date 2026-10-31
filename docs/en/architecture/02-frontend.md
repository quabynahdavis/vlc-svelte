# Frontend Architecture

**Status:** the application shell, six browse views, player, right dock, settings modal, welcome screen, layout editor and local persistence are implemented. Library, music, playlist, recent and network data are still mock data; library file/folder/stream imports and blob-backed playlist tracks are session-only, and native file access and media metadata are planned. Last updated 2026-10-31.

The frontend builds and type-checks: `bun run check` reports 0 errors and 0 warnings, and `bunx vite build` writes `src-tauri/gen/dist/`.

## Entry point

`index.html` contains `<div id="app">`, loads `/src/main.ts`, and runs a small pre-paint script. That script reads only the `theme` field from `localStorage['vlc.settings.v1']`, resolves `light`/`system`/`dark` and sets `data-theme` plus `color-scheme` before the stylesheet paints, so a saved light theme does not flash dark.

`src/main.ts` imports `app.css`, subscribes `applyAppearance` to the settings store, and mounts `App.svelte` on `#app`. The subscription covers the initial load and every later change, reset or import.

`src/app.css` contains the Tailwind directives and the token layer: the dark palette on `:root`, the light overrides on `:root[data-theme='light']`, `-rgb` companions for opacity modifiers, base typography, selection colour, scrollbar styling and drag-region rules.

## Application shell (`src/App.svelte`)

- `<TitleBar>` renders in a 40 px strip unless `$settings.useSystemTitleBar` is true. The setting is applied to the native window by `applyWindowDecorations()` whenever it changes.
- `<IconRail>` is a 64 px collapsed / 200 px expanded rail. `activeNav` comes from `stores/navigation.ts`; expansion is remembered per destination in component state.
- `<main>` switches on `$activeNav`:
  - `home` → `PlayerView`;
  - `videos` → `LibraryView`;
  - `music` → `MusicView`;
  - `network` → `NetworkView`;
  - `recent` → `RecentView`;
  - `playlists` → `PlaylistsView`;
  - any other id → a "Coming soon" placeholder.
- The 400 px property dock renders `<PropertyPanel>` when `$propertiesPanel` is true. `propertyPreset` selects the compressor or video-adjustment preset.
- An optional 288 px details aside is gated by `showRightPanel`; nothing currently sets it to true.
- `<SettingsModal>` renders as a full-window overlay when `showSettings` is true. `openSettingsAt(category)` opens it and clicks the matching category button after mount.
- `<WelcomeScreen>` shows on first run (`vlc.onboarding.v1`) and can be reopened from the menu. It edits theme, accent, language and library folders.
- `<AddToPlaylistDialog>` is mounted once at shell level and driven by `stores/playlistTarget.ts`; library and music rows open it with the selected track.
- `<ContextMenu>` is mounted at shell level. The title-bar menu button opens the full menu anchored under the button; right-clicking `<main>` opens the compact playback menu. `handleMenuAction` maps ids to player actions, fullscreen, dock opens, queue clearing, media pickers, settings/layout/welcome and quit.
- `hideChrome` toggles the `chrome-hidden` class, which hides the title bar and icon rail.

There is no URL router. `activeNav`, `showSettings`, the property dock and `hideChrome` are in-memory and reset on reload.

## Views

### Player view (`src/views/PlayerView.svelte`)

- A 300 px `PlaylistPanel` on the left, shown by default. On narrow windows it overlays the stage above the transport; on `lg` and wider it is a static column.
- A video stage renders `<video>` from `$currentTrack?.src` when the queue has a track; otherwise an empty state with the VLC cone and "No media loaded".
- Media-element listeners keep the player store in sync: `loadedmetadata`, `durationchange`, `timeupdate`, `play`, `playing`, `pause`, `ended`, `progress` and `error`. Buffered ratio is derived from `video.buffered`.
- Store-to-element reactions handle source changes, play/pause intent, store-initiated rewinds and volume/mute. The store is the single source of truth for transport intent.
- `ended` repeats the current item for `repeat === 'one'`, otherwise advances the queue.
- Stage gestures: a single click toggles playback after a 250 ms delay so a double click can win; double click toggles fullscreen; wheel adjusts volume in 4% steps (1% with Shift) and shows a HUD for 800 ms. Wheel over `[data-right-dock]` or `[data-compact-library]` is left alone.
- A **Library** button in the stage (windowed) and fullscreen top bar opens `CompactLibraryOverlay`: search, watched filter, sort, progress rows, add-media menu and drag-to-queue. Escape closes it and focus returns to the trigger.
- Fullscreen targets a shell that wraps the stage and transport. A top overlay shows the media title, picture-in-picture (when supported) and exit-fullscreen. Top and bottom chrome auto-hide after 2.5 seconds; pointer movement, focus or a key press reveals them, and focused controls are never hidden. Hidden chrome is `inert`.
- Picture-in-Picture uses the browser API on the active `<video>`; the toggle is shown only when `document.pictureInPictureEnabled` and `requestPictureInPicture` are available.
- `RightDock` sits inside the stage and hosts the Playback, Video, Audio, Visualizer, Subtitles and Bookmarks panels plus the queue. Tab order and the visibility of secondary transport controls come from `stores/layout.ts`.
- `TransportBar` receives the video element, media availability, buffered ratio, the fullscreen shell and the settings callback.
- Scoped CSS makes the fullscreen shell black, pins the dark palette, overlays the transport on a gradient and disables HUD/chrome transitions under `prefers-reduced-motion`.

**Known gaps:** no media is queued at startup, so the default screen is the empty state; the queue is not persisted; the playlist panel shows the live queue but has no saved-playlist management.

### Library view (`src/views/LibraryView.svelte`)

- `LibraryToolbar` receives the breadcrumb, filtered count, search query, sort state and watched filter; typing updates `searchQuery`. Breadcrumb segments are buttons that truncate the path.
- Grid mode renders responsive 16:9 `MediaCard` tiles (2–5 columns).
- List and compact modes render `MediaListRow`; list rows show a 16:9 thumbnail, episode code, duration and progress, compact rows are 40 px high.
- Sorting uses `librarySortKey` (`title`, `duration`, `progress`, `episode`, `watched`) and `librarySortDirection`; ties keep the original order. `watched` ascending puts unwatched items first.
- The watched filter (`all`, `unwatched`, `watched`) is a radiogroup with arrow/Home/End navigation and combines with the search query.
- Empty states distinguish "no results for the query" from an empty folder and offer clear-search/clear-filter actions.
- Selecting an item maps the sorted library to tracks, calls `setQueue` and navigates to `home`.
- Cards and rows are draggable with the shared `application/x-vlc-track` payload; hover actions add to the queue or open the add-to-playlist dialog.
- `LibraryAddMenu` provides **Add file…**, **Add folder…** and **Add network stream…**. File and folder selection use hidden HTML inputs; the stream dialog accepts `http(s)://` or `rtsp://`. Imports append to the store, probe duration with a detached `<video>`, and write a dismissible status line.
- Imported files use `URL.createObjectURL(file)` as their source. Those URLs are session-only and are not persisted across reloads.

### Music view (`src/views/MusicView.svelte`)

- Browse modes: Songs, Albums, Artists and Genres, each with a breadcrumb and back button.
- Sort keys adapt to the level: name/albums/duration for artists, title/year/duration for albums, title/artist/duration for tracks. Sorting is stable and direction-aware.
- `ViewModeToggle` switches grid/list/compact; `FuzzySearch` filters the current level.
- Album artwork is a placeholder glyph; no artwork is bundled. A decorative waveform strip is available in the track views.
- Playing a track queues the visible tracks with `DEMO_MEDIA_SRC` and navigates to the player.
- Track rows are draggable and expose hover actions for add-to-queue and add-to-playlist.

### Playlists view (`src/views/PlaylistsView.svelte`)

- A 200 px playlist sidebar with back, sort menu (manual, name, date, item count), create button, search and pin/unpin. Pinned and unpinned lists render as separate sections.
- The detail pane lists tracks in grid/list/compact; selecting a track queues the playlist with `DEMO_MEDIA_SRC` and navigates to the player.
- `CreatePlaylistDialog` creates a session playlist, optionally with picked files; `AddToPlaylistDialog` appends an existing track and can create a named playlist inline. Blob-backed playlists are not persisted.

### Recent view (`src/views/RecentView.svelte`)

- Tabs for Media, Devices and Network, a search field, a view-mode toggle and a clear-history action.
- Items are always sorted newest-first and grouped by calendar day ("Today", "Yesterday", "N days ago", or a date).
- Grid, list and compact layouts share the same groups.
- The mock feed has no playback position, so progress is derived deterministically from the item id.
- Recent rows are display-only; they do not open media.

### Network view (`src/views/NetworkView.svelte`)

- A 200 px category sidebar: Saved Streams, Local Network, Podcasts, Internet Radio, Shoutcast, Jamendo and Icecast.
- Saved Streams lists user streams with add, edit, play and remove actions, persisted under `vlc.network.streams.v1`; `AddStreamDialog` validates `http(s)://` and `rtsp://` URLs.
- Internet Radio renders a searchable station list with genre, bitrate and country.
- Podcasts render shows, then episodes, with a breadcrumb; episodes show publish date and duration.
- Local Network renders a static UPnP/DLNA tree; other categories show a "No content" message.
- Grid/list/compact view modes are available. Station and episode selection is local UI state; saved streams can queue into the player.

### Settings view (`src/views/SettingsView.svelte`)

Legacy scaffold: a light-themed card with static controls. It is **not imported or mounted** by `App.svelte`; `SettingsModal` supersedes it. It should be deleted or converted.

## Settings modal (`src/components/SettingsModal.svelte`)

A full-window modal with a dimmed `bg-vlc-app/95` backdrop and a `12px` panel on `--bg-app`.

- Search filters both category labels and a field-level keyword index.
- Groups: **App** (General, Interface, Privacy, Controls, Layout, Profiles), **Media** (Playback, Video, Audio, Subtitles, Library) and **System** (Network, Performance, Recording, Extensions, Export/Import).
- All sixteen categories render a real panel; `PlaceholderPanel` remains only as a fallback for an unknown id.
- **Layout** reorders the navigation rail and right-dock tabs (drag or arrow buttons), toggles secondary player controls and resets to defaults; it persists under `vlc.layout.v1`.
- **Profiles** saves, applies and deletes named settings profiles.
- Escape closes the modal. A reset button restores defaults after confirmation.
- `GeneralPanel` and `InterfacePanel` both expose the theme; `GeneralPanel` owns the accent swatches, and `InterfacePanel` owns the system title bar toggle.
- `ExportImportPanel` exports the current settings as JSON and imports a validated file.
- `SubtitlesPanel` includes a four-tab strip that navigates to Playback, Video, Audio or Subtitles.

## Component library

| Component | File | Notes |
| --- | --- | --- |
| `TitleBar` | `src/components/TitleBar.svelte` | VLC cone, centred title, menu/settings button, Tauri window controls, double-click maximize. |
| `IconRail` | `src/components/IconRail.svelte` | Nav items from `lib/constants.ts`; collapsible; accent active state. |
| `PlaylistPanel` | `src/components/PlaylistPanel.svelte` | Queue header, count, search/sort/grid actions, live queue rows. |
| `TransportBar` | `src/components/TransportBar.svelte` | Left transport, thick seek with hover previews, cone volume, compact next button, right-side dock/settings/fullscreen controls. |
| `LibraryToolbar` | `src/components/LibraryToolbar.svelte` | Breadcrumb buttons, count, search, watched filter, sort menu, add menu and view-mode toggle. |
| `LibraryAddMenu` | `src/components/LibraryAddMenu.svelte` | Add-file, add-folder and add-network-stream menu with keyboard navigation, URL validation and status feedback. |
| `ViewModeToggle` | `src/components/ViewModeToggle.svelte` | Shared grid/list/compact segmented control with accessible pressed state. |
| `MediaCard` | `src/components/MediaCard.svelte` | 16:9 poster tile with title and progress hairline. |
| `MediaListRow` | `src/components/MediaListRow.svelte` | Shared list/compact row with thumbnail, episode code, duration and progress. |
| `FuzzySearch` | `src/components/FuzzySearch.svelte` | Debounced search input that dispatches `search`. |
| `RightDock` | `src/components/RightDock.svelte` | 340 px dock with compact tabs, overflow chevrons, keyboard navigation and lazy-loaded panels. |
| `SettingsModal` | `src/components/SettingsModal.svelte` | Modal shell, search, category navigation and reset. |
| `ContextMenu` | `src/components/ContextMenu.svelte` | Full title-bar menu and compact right-click menu, submenus, shortcuts, viewport clamping. |
| `WelcomeScreen` | `src/components/WelcomeScreen.svelte` | First-run theme/accent/language/folder setup with focus trap and persistence. |
| `CompactLibraryOverlay` | `src/components/CompactLibraryOverlay.svelte` | Player library drawer with search, filter, sort, drag-to-queue and focus return. |
| `AddToPlaylistDialog` | `src/components/AddToPlaylistDialog.svelte` | Playlist picker with inline creation, driven by `stores/playlistTarget.ts`. |
| `AddStreamDialog` | `src/components/AddStreamDialog.svelte` | Saved-stream add/edit dialog with URL validation. |
| `CreatePlaylistDialog` | `src/components/CreatePlaylistDialog.svelte` | Playlist name plus optional file picking and duration probing. |
| `MusicCover` | `src/components/MusicCover.svelte` | Placeholder cover artwork with size variants. |
| `PropertyPanel` | `src/components/PropertyPanel.svelte` | Collapsible effect sections; exports `compressorPreset` and `videoPreset`. |
| `PropertySlider` | `src/components/PropertySlider.svelte` | Tick-marked range with formatted value. |
| `DropZone` | `src/components/DropZone.svelte` | Reusable drag-and-drop file target with extension filtering. |

Dock panels under `src/components/dock/`: `PlaybackPanel`, `VideoEffectsPanel`, `AudioEffectsPanel`, `AudioVisualizerPanel`, `SubtitleDockPanel`, `SubtitleTimeline`, `BookmarksPanel`, `QueuePanel`, plus `EqPanel`, `Accordion`, `DockSlider` and `TogglePill`.

Settings primitives under `src/components/settings/`: `Section`, `SettingRow`, `Toggle`, `Slider`, `Segmented`, `Select`, `TextInput`, `ColorField`, `Swatch`, `GeneralPanel`, `InterfacePanel`, `PrivacyPanel`, `ControlsPanel`, `PlaybackPanel`, `VideoPanel`, `AudioPanel`, `SubtitlesPanel`, `LibraryPanel`, `NetworkPanel`, `PerformancePanel`, `RecordingPanel`, `ExtensionsPanel`, `ExportImportPanel` and `PlaceholderPanel`.

## File tree

```
src/
├── components/
│   ├── TitleBar.svelte
│   ├── IconRail.svelte
│   ├── PlaylistPanel.svelte
│   ├── TransportBar.svelte
│   ├── LibraryToolbar.svelte
│   ├── LibraryAddMenu.svelte
│   ├── ViewModeToggle.svelte
│   ├── MediaCard.svelte
│   ├── MediaListRow.svelte
│   ├── FuzzySearch.svelte
│   ├── RightDock.svelte
│   ├── ContextMenu.svelte
│   ├── PropertyPanel.svelte
│   ├── PropertySlider.svelte
│   ├── DropZone.svelte
│   ├── SettingsModal.svelte
│   ├── WelcomeScreen.svelte
│   ├── CompactLibraryOverlay.svelte
│   ├── AddToPlaylistDialog.svelte
│   ├── AddStreamDialog.svelte
│   ├── CreatePlaylistDialog.svelte
│   ├── MusicCover.svelte
│   ├── dock/
│   │   ├── Accordion.svelte
│   │   ├── AudioEffectsPanel.svelte
│   │   ├── AudioVisualizerPanel.svelte
│   │   ├── BookmarksPanel.svelte
│   │   ├── DockSlider.svelte
│   │   ├── EqPanel.svelte
│   │   ├── PlaybackPanel.svelte
│   │   ├── QueuePanel.svelte
│   │   ├── SubtitleDockPanel.svelte
│   │   ├── SubtitleTimeline.svelte
│   │   ├── TogglePill.svelte
│   │   └── VideoEffectsPanel.svelte
│   └── settings/
│       ├── GeneralPanel.svelte
│       ├── InterfacePanel.svelte
│       ├── PrivacyPanel.svelte
│       ├── ControlsPanel.svelte
│       ├── PlaybackPanel.svelte
│       ├── VideoPanel.svelte
│       ├── AudioPanel.svelte
│       ├── SubtitlesPanel.svelte
│       ├── LibraryPanel.svelte
│       ├── NetworkPanel.svelte
│       ├── PerformancePanel.svelte
│       ├── RecordingPanel.svelte
│       ├── ExtensionsPanel.svelte
│       ├── ExportImportPanel.svelte
│       ├── LayoutPanel.svelte
│       ├── ProfilesPanel.svelte
│       ├── HotkeysWindow.svelte
│       ├── InfoTip.svelte
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
├── i18n/
│   └── en.json               # English strings for the t() helper
├── lib/
│   ├── constants.ts          # Nav ids, labels and rail items
│   ├── dragTrack.ts          # Shared application/x-vlc-track drag payload
│   ├── gestures.ts           # Double-click delay, wheel volume, fullscreen helper
│   ├── mock.ts               # MediaItem, music, playlist, recent and network mock data
│   ├── settingsPersistence.ts# vlc.settings.v1 load/save/validate
│   ├── t.ts                  # Translation lookup
│   ├── theme.ts              # Theme resolution and accent palette
│   └── windowChrome.ts       # Custom/system window decorations
├── stores/
│   ├── avPrefs.ts            # Audio track and output-device preferences
│   ├── bookmarks.ts          # Bookmarks and chapters (vlc.bookmarks.v1)
│   ├── layout.ts             # Rail/tab order and player-control visibility
│   ├── library.ts            # Breadcrumb, items, search, sorting
│   ├── music.ts              # Music breadcrumb, selection, sort
│   ├── navigation.ts         # activeNav and navigate()
│   ├── network.ts            # Category, path, search, saved streams
│   ├── onboarding.ts         # First-run completion (vlc.onboarding.v1)
│   ├── player.ts             # Queue, playback, volume, repeat/shuffle
│   ├── playlistTarget.ts     # Add-to-playlist dialog state
│   ├── playlists.ts          # Playlist selection, sort, pins, add/create
│   ├── recent.ts             # Recent tab, search and filter
│   ├── settings.ts           # SettingsState, defaults, helpers, accents
│   ├── settingsProfiles.ts   # Named settings profiles
│   ├── subtitleProfiles.ts   # Per-show subtitle defaults (vlc.subtitles.v1)
│   ├── ui.ts                 # Context menu, property dock, dock mode
│   └── viewModes.ts          # Per-scope grid/list/compact persistence
├── views/
│   ├── PlayerView.svelte
│   ├── LibraryView.svelte
│   ├── MusicView.svelte
│   ├── PlaylistsView.svelte
│   ├── RecentView.svelte
│   ├── NetworkView.svelte
│   └── SettingsView.svelte   # Legacy scaffold, not mounted
├── App.svelte
├── app.css
└── main.ts
```

## State and data

- **`stores/player.ts`** — `player` holds `queue`, `currentIndex`, `isPlaying`, `currentTime`, `duration`, `volume`, `muted`, `repeat` and `shuffle`; `currentTrack` is derived. Helpers: `setQueue`, `playAt`, `addToQueue`, `clearQueue`, `next`, `prev`, `toggle`, `stop`, `seek`, `setVolume`, `toggleMute`. The `<video>` element remains the time source while playing; the view writes element events back into the store.
- **`stores/library.ts`** — `breadcrumb`, `libraryItems`, `searchQuery`, `filteredItems`, `librarySortKey`, `librarySortDirection`, `libraryWatchFilter`, `libraryImportLog` and derived `sortedItems`. `isItemWatched` treats any progress above zero as watched. `addImportedItems` appends entries with the next episode numbers; `updateLibraryItemDuration` applies a probed duration. Demo data comes from `lib/mock.ts`.
- **`stores/music.ts`** — `musicBreadcrumb`, `selectedArtistId`, `selectedAlbumId`, `musicSearch`, `musicSort` and `musicSortDirection`. A legacy `musicViewMode` store remains here, but the view uses `stores/viewModes.ts`.
- **`stores/playlists.ts`** — `playlistsData`, `playlistsSelectedId`, `playlistsSearch`, `playlistsSort`, `playlistsSortDirection` and `pinnedPlaylistIds`. `addTrackToPlaylist` and `createPlaylistWithTrack` power the add-to-playlist dialog; blob-backed tracks are session-only, while pins persist.
- **`stores/recent.ts`** — `recentActiveTab`, `recentSearch` and `recentFilterType`.
- **`stores/network.ts`** — `networkSelectedCategory`, `networkPath`, `networkSearch`, `networkViewSubPath` and `savedStreams` with add/update/remove helpers, persisted under `vlc.network.streams.v1`.
- **`stores/navigation.ts`** — `activeNav` and `navigate(id)`.
- **`stores/ui.ts`** — `contextMenu`, `propertiesPanel`, `dockMode` and `openDock(mode)`; selecting the active dock mode closes it.
- **`stores/settings.ts`** — one `SettingsState` writable with `bind:value={$settings.field}` support. Exports `defaultSettings`, `createDefaultSettings`, `resetSettings`, `importSettingsFromJson`, `EQ_BANDS`, `ACCENT_COLORS`, `DEFAULT_HOTKEYS` and helpers for EQ, hotkeys, folders, video filters and extensions.
- **`stores/viewModes.ts`** — one writable per scope (`library`, `music`, `playlists`, `recent`, `network`), backed by one versioned JSON object.
- **`stores/layout.ts`** — `layout` holds rail order, dock-tab order and secondary player-control visibility; validated and persisted under `vlc.layout.v1`.
- **`stores/onboarding.ts`** — first-run completion state under `vlc.onboarding.v1`.
- **`stores/playlistTarget.ts`** — open state, track and focus anchor for `AddToPlaylistDialog`.
- **`stores/subtitleProfiles.ts`** — formatting, presets and per-show track/language defaults under `vlc.subtitles.v1`.
- **`stores/bookmarks.ts`** — per-media bookmarks and chapters under `vlc.bookmarks.v1`.
- **`stores/settingsProfiles.ts`** — named settings snapshots for the Profiles category.
- **`stores/avPrefs.ts`** — selected audio track and output device for the audio dock.

### Helpers

- **`lib/theme.ts`** — resolves `dark`/`light`/`system`, follows OS changes, validates hex accents, derives the pressed/deepest ramp and writes the CSS variables, `<html lang>` and `data-theme` attributes.
- **`lib/settingsPersistence.ts`** — loads, merges and validates persisted settings; debounces saves by 250 ms; flushes on `pagehide`; parses imported JSON.
- **`lib/windowChrome.ts`** — lazily imports `@tauri-apps/api/window` and calls `setDecorations(!useSystem)`; no-op with a console warning in the browser.
- **`lib/gestures.ts`** — shared constants and helpers for stage click timing, wheel normalisation and fullscreen.
- **`lib/t.ts`** — `t(key)` lookup over `i18n/en.json`. The shell and some components use it; many strings are still hardcoded.

## Persistence

| Key | Owner | Shape and behaviour |
| --- | --- | --- |
| `vlc.settings.v1` | `src/lib/settingsPersistence.ts` | Full `SettingsState` JSON. Merged over defaults, field-validated, unknown keys dropped, accent normalised to uppercase. Debounced 250 ms and flushed on `pagehide`. Read before paint by `index.html`. |
| `vlc.viewModes.v1` | `src/stores/viewModes.ts` | Object keyed by scope (`library`, `music`, `playlists`, `recent`, `network`) with `grid`/`list`/`compact` values. Each scope is validated independently; malformed data falls back to its default. |
| `vlc.layout.v1` | `src/stores/layout.ts` | Rail order, dock-tab order and secondary player-control visibility. Unknown ids are dropped and missing ids appended. |
| `vlc.onboarding.v1` | `src/stores/onboarding.ts` | First-run completion flag and timestamp. |
| `vlc.subtitles.v1` | `src/stores/subtitleProfiles.ts` | Subtitle formatting, custom presets and per-show track/language defaults. |
| `vlc.bookmarks.v1` | `src/stores/bookmarks.ts` | Per-media bookmarks and chapter markers. |
| `vlc.network.streams.v1` | `src/stores/network.ts` | Saved stream names and URLs. |
| `vlc.playlists.pins.v1` | `src/stores/playlists.ts` | Pinned playlist ids only; playlist contents stay in memory. |
| `vlc.av.prefs.v1` | `src/stores/avPrefs.ts` | Selected audio track and output device. |
| `vlc.settings.profiles.v1` | `src/stores/settingsProfiles.ts` | Named settings snapshots. |

Settings can also be exported to `vlc-settings.json` and re-imported through `ExportImportPanel`. Playback state, queue contents, navigation state, imported `blob:` media and playlist contents are **not** persisted. Imported media and blob-backed playlists therefore disappear on reload; pins, saved streams, subtitle profiles, bookmarks, layout and onboarding survive.

## Styling conventions

Canonical tokens live in [../design/01-design-system.md](../design/01-design-system.md).

| Concern | Current code |
| --- | --- |
| Approach | Inline Tailwind utilities plus small scoped `<style>` blocks for range inputs, fullscreen and the dock shadow. |
| Theme | `data-theme` on `<html>`, semantic CSS variables, Tailwind `vlc.*` utilities. |
| Accent | Runtime CSS variables derived from `$settings.accentColor`; use `vlc-orange` for fills and `vlc-orangeText` for accent text/icons. |
| Surfaces | `vlc.app`, `vlc.panel`, `vlc.panel-alt`, `vlc.card`, `vlc.raised`. |
| Borders | `vlc.border` is the hairline for legacy reasons; `vlc.borderStrong` is the visible edge. |
| Typography | Inter first in the stack; currently loaded from Google Fonts in `index.html`. |
| Icons | `lucide-svelte`, 1.6–1.8 px strokes; monochrome interactive icons. |
| Radii | `rounded-panel` 12 px, `rounded-control` 8 px, `rounded-input` 6 px. |
| Dark exceptions | Video stage, HUD, thumbnails and the visualizer canvas keep literal dark values. |

Contributing conventions:

- Use `<script lang="ts">` in every component; TypeScript is preprocessed by `svelte-preprocess`.
- `tsconfig.json` enables `strict` and `verbatimModuleSyntax`; use `import type { ... }` for type-only imports.
- Component files are PascalCase; top-level screens use the `View` suffix; state and functions use camelCase.
- Prefer small components over growing views.
- Every icon-only button needs an accessible name and a visible focus state.
- Do not add raw hex values outside the documented dark exceptions; add or use a token instead.

## Known gaps

| Gap | Detail |
| --- | --- |
| Mock data | Library, music, playlists, recent and network data come from `lib/mock.ts`. |
| Demo playback | Mock items use `/demo/sample.mp4`; imported local files use session object URLs and network streams use their remote URL. There is no native file picker or metadata probe beyond duration. |
| Session-only imports | Imported files and streams are held in memory only. Object URLs and the added items disappear on reload. |
| No startup media | The player queue is empty, so the app opens on the empty state. |
| Queue is not persisted | Queue and playback position reset on reload. |
| Native integration | No `invoke` calls, Rust commands, plugins or metadata access; only window API calls are used. |
| No router | `activeNav` and other shell state are lost on reload. |
| Inert actions | The rail's Add Item entry, create playlist, add-to-playlist, recent rows and network selections do not perform media actions. Library add-file/folder/stream actions do work. |
| Details panel unreachable | `showRightPanel` is never set to true. |
| Legacy view | `SettingsView.svelte` is unused and still light-themed. |
| Partial i18n | `t()` covers only part of the UI; most view strings are hardcoded English. |
| Font delivery | Inter is loaded from Google Fonts rather than bundled. |
| No tests | No unit, component or end-to-end test setup. |
