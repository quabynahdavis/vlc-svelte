# Redesign Vision

**Status:** target document. This file records the intended direction for the next redesign pass. Items under **Planned** are **not implemented**; do not treat them as current behaviour. Implemented and in-progress items are called out in [Current status](#current-status). Last updated 2026-10-29.

## Direction

- Keep the **orange VLC cone** and the **neutral grey** foundation. The accent stays functional, not decorative.
- Keep the interface **rectangular but softened**: clear rectangular footprints, small radii, quiet borders and surface steps instead of heavy shadows.
- Put content first. Chrome should recede while media plays and return on demand.
- Keep the desktop density of VLC while making the hierarchy calmer and the controls easier to hit.

## Player

### Transport and seek

- Player controls stay on the **left**: previous, a **larger play/pause button**, then next. The play button is the visual anchor of the bar.
- Settings, fullscreen, queue, audio and subtitles stay on the **right**.
- **Volume is a cone**: a triangular level control that echoes the VLC cone rather than a generic horizontal slider.
- The **bottom seek bar is thick** and spans the available width, with a buffered segment, accent progress and a clear thumb.
- Hovering the seek bar shows a **thumbnail preview** of the target frame plus a timestamp.
- **Fullscreen and picture-in-picture** controls belong at the **top** of the player, near the title area.
- A **next-episode prompt** appears near the end of an episode, with the next title, a short countdown and actions to play now or cancel.
- In fullscreen, the **top and bottom chrome auto-hide**; moving the pointer to the top or bottom edge reveals them again. Keyboard focus must also reveal them.

### Chrome and menus

- The **top bar** carries the title, the consolidated menu and the window controls.
- Replace scattered entry points with **one consolidated menu** for playback, video, audio, subtitles, playlist, open media and settings.
- Keep a **cleaned right-click menu** for fast access, including **Hide interface**. It should be shorter than today's menu and avoid duplicating the full settings tree.

### Right sidebar

- A single right sidebar with **Subtitles, Audio, Video and Playback** tabs.
- The same sidebar hosts **bookmarks and chapters**, so navigation inside long media does not require a separate window.
- Tabs should stay compact: icon-only when inactive, icon plus label when active, with overflow chevrons when the strip is too narrow.

### Subtitles

- A **subtitle timeline** that shows cues against the seek bar, not just a delay field.
- Formatting controls for font, size, colour, outline, background and positioning.
- **Presets** for common viewing setups.
- **Default track and language per show**, remembered across episodes.
- Human-readable track matching instead of raw track numbers.

### Audio

- **Audio track selection** per media item.
- **Audio output device** selection.
- Keep the existing equalizer and effects, but present them as part of the Audio tab rather than a separate concept.

### Video

- **Video filters with live previews**, so crop, rotate, colour, sharpen, denoise and similar filters can be judged before applying.
- Keep the existing filter list and effect sliders as the underlying model.

### Playback extras

- Playback speed, reverse playback and a sleep timer.
- Optional **waveform** display for audio and music.
- Metadata inspection for the current media item.

## Library

- A **breadcrumb/address bar** that shows the current folder and can be edited or navigated directly.
- **Grid, list and details** views. Grid is visual, list is scannable, details exposes metadata and actions.
- Sort by **watched/unwatched** as well as title, duration, progress and episode.
- Search stays available in every view.
- **Add file** and **add folder** actions in the library toolbar and the empty state.
- While a video plays, the library can open as a **compact overlay** instead of replacing the player.

## Music

- Browse by **songs, albums, artists and genres**.
- A **large cover** area for the selected album or artist.
- An optional **waveform scrollbar** for seeking within a track.
- Keep the current view-mode and sorting model; add genre as a first-class level.

## Playlists and queue

- Keep **queue** and **playlists** distinct: the queue is what plays next; playlists are saved collections.
- **Drag to queue** from library, music, playlists, recent and network.
- Clear **create-playlist** and **add-to-playlist** flows, including a name prompt and confirmation.
- Playlist sidebar sections for **pinned**, **recent** and **home** playlists.
- Reordering and removal should be explicit, with undo where practical.

## Network

- **Saved streams** for radio, podcasts and custom URLs.
- A **simplified add flow**: paste a URL, detect the type, name it and save it.
- Keep the category sidebar (Local Network, Podcasts, Internet Radio, Shoutcast, Jamendo, Icecast, Custom URL) and the existing radio/podcast browse levels.

## Settings and personalisation

- **10+ settings categories**, grouped as App, Media and System.
- A **separate hotkeys window** rather than a table buried in a settings pane.
- **Human-readable subtitle matching** rules (language, title, forced/default) instead of numeric track ids.
- **Info icons** with short explanations next to non-obvious settings.
- **Profiles** for different users or viewing contexts.
- A **welcome screen** for first run: language, theme, accent and library folders.
- **Drag-and-drop layout customisation** for the rail, player controls and sidebar tabs.

## Current status

This section separates what exists in `src/` from the target above.

### Implemented

| Area | State |
| --- | --- |
| Dual theme and accent | Dark, light and system themes are implemented with semantic CSS variables (`src/app.css`), runtime application (`src/lib/theme.ts`) and a pre-paint script (`index.html`). The accent is user-configurable from General settings. |
| Title bar choice | `useSystemTitleBar` in Interface settings switches between the in-app title bar and native decorations (`src/stores/settings.ts`, `src/lib/windowChrome.ts`, `src/App.svelte`, `src/components/TitleBar.svelte`, Tauri capability). |
| Transport layout | Previous, play/pause and next are on the left; audio, subtitles, settings, fullscreen and queue are on the right (`src/components/TransportBar.svelte`). |
| Queue versus playlists | The player queue is separate from saved playlists. Library, music and playlist tracks queue into the player and navigate to it. |
| Dock tabs | Inactive tabs are icon-only; the active tab shows icon plus label; overflow chevrons and arrow-key/Home/End navigation are implemented (`src/components/RightDock.svelte`). |
| Subtitle basics | Delay, speed, duration factor, font, text/outline colour and a preset section exist in the Subtitles settings pane and dock panel. |
| View modes and sorting | Grid/list/compact per scope, shared toggle, list/compact rows, and sort menus in Library, Music and Playlists. Recent is newest-first and grouped by day. |
| Settings categories | Sixteen categories are implemented, including General, Interface, Privacy, Controls, Layout, Profiles, Playback, Video, Audio, Subtitles, Library, Network, Performance, Recording, Extensions and Export/Import. Settings persist, validate, reset and import/export. |
| Playback wiring | Library, music and playlists queue tracks; the bundled demo clip `public/demo/sample.mp4` plays through the shared transport; video and store state stay in sync. |

### Implemented — player and shell additions

| Area | State |
| --- | --- |
| Transport detail | Larger play button, cone volume control and a thicker seek bar (`TransportBar.svelte`). |
| Seek previews | Hover thumbnail card backed by a 160 × 90 canvas plus a timestamp; the card stays inside the viewport. |
| Next episode | A compact **Next** button appears in the last 20 seconds when another queue item is available. A full prompt with countdown and cancel is still planned. |
| Fullscreen | Fullscreen targets a shell containing the stage and transport. A top bar carries the title, library, picture-in-picture and exit controls; top/bottom chrome auto-hide after 2.5 seconds and return on pointer, focus or key activity. |
| Consolidated menu | The title-bar menu button opens the full application menu (playback, video, audio, subtitle, playlist, open media, settings, layout, welcome, quit). Right-click opens a shorter playback-focused menu that keeps **Hide UI**. |
| Compact library overlay | The player can open a 420 px library drawer in windowed and fullscreen modes, with search, watched/unwatched filter, sorting, progress rows, add-media menu and drag-to-queue. Escape closes it and focus returns to the trigger. |
| Welcome screen | First-run dialog for theme, accent, interface language and library folders, persisted under `vlc.onboarding.v1`; it can be reopened from the menu. |
| Layout editor | Settings → Layout reorders the navigation rail and right-dock tabs by drag or arrow buttons, toggles secondary player controls, and resets to defaults. Persisted under `vlc.layout.v1`. |

### Implemented — media, queue and settings additions

| Area | State |
| --- | --- |
| Library | Watched/unwatched filtering, a `watched` sort key, clickable breadcrumbs, add file/folder/network actions, empty states and import status. Grid, list and compact modes remain. |
| Drag to queue | Library cards/rows, music rows and compact-overlay rows expose the shared `application/x-vlc-track` payload. The playlist panel accepts the drop, shows a drop hint and appends with `addToQueue` without interrupting playback. |
| Add to playlist | Library and music rows expose **Add to playlist**; the dialog lists playlists, adds the track and can create a session playlist inline. Playlists with `blob:` sources stay session-only; pins persist under `vlc.playlists.pins.v1`. |
| Playlists | Create-playlist flow, pin/unpin with **Pinned** and **All playlists** sections, sorting, search, grid/list/compact rows and queueing. |
| Subtitles | Timeline sync, formatting, presets, per-show default track/language, human-readable matching and a dedicated dock panel. Profiles persist under `vlc.subtitles.v1`. |
| Audio and video | Audio track plus output-device selection; video filter previews and effect controls in the right dock. |
| Bookmarks and chapters | A dedicated right-dock tab; bookmarks persist under `vlc.bookmarks.v1`. |
| Music | Songs / Albums / Artists / Genres browse modes, large cover art, genre detail levels and an optional waveform strip. |
| Network | Saved streams with add, edit, play and remove flows, persisted under `vlc.network.streams.v1`; the saved list replaces the redundant Custom URL category. |
| Settings | Sixteen categories including Layout and Profiles, a separate hotkeys window, info tips, human-readable subtitle matching and JSON export/import. |
| Profiles | Named settings profiles can be saved, applied and deleted. |

### Planned — not implemented

- A full next-episode prompt with countdown and cancel action (the compact Next button is the current step).
- An editable library address bar, a dedicated details view and native filesystem pickers inside the Tauri shell.
- Real media-library scanning, metadata extraction and artwork; the current library is mock data plus session imports.
- Persistent imported media and playlist tracks whose sources are `blob:` URLs; these remain session-only by design.
- Playlist drag-reordering and drag-to-playlist (drag currently targets the queue).
- Native Tauri playback, disc playback and OS media-key integration; the browser `<video>` element remains the playback engine.
- Full keyboard remapping beyond the hotkeys window, and per-profile hotkey sets.
