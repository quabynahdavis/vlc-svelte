# Changelog — English Documentation

Dates use `YYYY-MM-DD`. This file records project milestones and documentation changes for the English documentation tree.

## 2026-11-09

### Added — Rust ffmpeg thumbnail pipeline (thumbnails persisted, no webview canvas)

- Library video and folder thumbnails now render reliably: frame capture moved out of the webview into Rust. `src-tauri/src/thumb.rs` exposes `thumb_get(path)` and `thumb_generate(path, seek_seconds)` commands; generation runs the system `/usr/bin/ffmpeg` (`-frames:v 1 -vf scale=-2:240 -q:v 5`, seek clamped 0.05–45s; 2 MB output cap with kill, 10s watchdog, nonzero exit/empty/missing binary all degrade to `None`), and a generated still is always `INSERT OR REPLACE`'d into the database before being returned, so the whole pipeline is one IPC roundtrip.
- New `thumbnails (path TEXT PRIMARY KEY, data BLOB NOT NULL, updated_at INTEGER)` table keyed by the file's absolute path: a still is captured at most once ever, and survives restarts.
- Frontend `src/lib/thumbnails.ts` resolves the session store from the pipeline first on desktop (cache hit → generate → only then the old `<video>`/canvas attempt as fallback); browser preview and session-only imports (blob URLs) keep the webview capture path with its concurrency 2 queue and per-session failure memory. Folder previews resolve through the unchanged `representativeId` → `$mediaThumbnails` layers in grid and list.
- Shell-side evidence: the exact production ffmpeg argument set produced a valid 450×240 JPEG (11,318 bytes) from `Screencast_20260506_214544.webm` and a 426×240 JPEG from an mp4 whose path contains spaces; oversized seeks exit non-zero and fall back.
- Rust core committed as `a63e087`, frontend as `4fe8a25`; `cargo test` 12/12, `svelte-check` 0 errors / 0 warnings, `vite build` clean.

### Fixed — App failed to boot: setup hook panicked with "Query returned no rows"

- The desktop app crashed on startup with `Failed to setup app: ... Query returned no rows` (exit code 101): the SQLite setup read `PRAGMA synchronous = NORMAL` back through `query_row`, but that pragma's assignment form returns no row (unlike `PRAGMA journal_mode`, which returns one) so rusqlite's `QueryReturnedNoRows` bubbled out of `open_database` into Tauri's setup hook.
- Both pragma reads in `open_connection` now tolerate a missing row via `.optional()`; the WAL journal mode and NORMAL synchronous settings themselves are unchanged. A regression test (`test_open_connection_sets_pragmas_and_schema`) opens a real file database through the actual open path and asserts the WAL mode plus the `kv` and `thumbnails` tables, so this crash shape now fails loudly in tests.
- Included in commit `a63e087` (verified same evidence via the `sqlite3` CLI: journal_mode prints `wal`, synchronous prints nothing, `wc -l` = 0).

### Added — All persisted stores migrated to SQLite (localStorage abandoned on desktop)

- Every remaining persisted store now goes through the SQLite bridge first introduced yesterday; after this change the desktop shell no longer reads or writes webview localStorage for any domain — it survives only as the browser-preview backend and the one-time legacy migration source in `src/lib/dbPersistence.ts`.
- Migrated domains and their versioned keys: watch state `vlc.watch.v1`, history `vlc.history.v1`, watch-later `vlc.watchlater.v1`, bookmarks `vlc.bookmarks.v1`, settings profiles `vlc.settings.profiles.v1`, subtitle profiles `vlc.subtitles.v1`, AV preferences `vlc.av.prefs.v1`, shell layout `vlc.layout.v1`, per-view modes `vlc.viewModes.v1`, onboarding `vlc.onboarding.v1`, playlist pins `vlc.playlists.pins.v1`, saved network streams `vlc.network.streams.v1`, and the hotkey window position `vlc.hotkeys.window.v1`.
- Uniform boot flow per store: synchronous start from defaults (browser preview keeps the old synchronous localStorage path behind `hasTauri()`), then an async hydration applies the validated SQLite snapshot a moment after boot; mutations that land during the load window keep the store from accepting a stale snapshot, and persistence is gated until hydration settles so boot emissions are never written back.
- New `createKeyWriter(key)` helper in `src/lib/dbPersistence.ts` serializes writes per key and coalesces bursts into the newest value so rapid mutations (e.g. watch-position ticks) never land in SQLite out of order.
- Committed in stages: `b9e29f5` (playback stores), `f7eec18` (profile stores), `8c492ce` (layout, view modes, onboarding, playlist pins, saved streams, hotkey window position); a `chore(autosave)` commit by the user's autosave tooling (`4fed667`) interleaved mid-stage and is acknowledged, not rewritten. `svelte-check` 0 errors / 0 warnings, `vite build` clean.

## 2026-11-08

### Added — SQLite storage layer for persisted blobs (first stage)

- The desktop shell now persists through an SQLite database instead of webview localStorage: `rusqlite` (bundled) writes to a single `kanea.db` file in the app data directory, with WAL journaling and a `kv` table (`key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER`) exposed to the webview via `db_get`/`db_set` commands in `src-tauri/src/db.rs`. The table mirrors the existing versioned `vlc.*.v1` keys one-to-one so store modules adopt it without reshaping data; Rust unit tests cover roundtrip, upsert and key independence (7/7 passing).
- New front-end bridge `src/lib/dbPersistence.ts`: `loadPersistedRaw`/`savePersistedRaw` use SQLite in the desktop shell and keep the localStorage path in browser preview. First-run legacy migration copies a key's webview-storage blob into SQLite when the key is missing there, so existing user data survives; localStorage is never consulted again once SQLite answers.
- The settings store (`vlc.settings.v1`) is the first domain fully on SQLite (committed as `548baee`): it starts synchronously from defaults, then `hydrateSettings` applies the validated SQLite snapshot after boot, discarding it when the user made a change during the load window; writes stay debounced 250 ms with a pagehide flush.
- Committed as `9f5fd8b`; `svelte-check` 0 errors / 0 warnings, `vite build` clean, `cargo test` 7/7.

### Added — Video and folder thumbnails

- Library cards now show real video frames: file cards (grid and list) and folder cards (grid and list) render a captured frame; failed or not-yet-captured items keep their existing placeholder styling.
- Captures are made client-side (`src/lib/thumbnails.ts`): a detached `<video>` loads the item's media source, seeks ~8% into the film (clamped 0.1s–45s), draws a frame to a canvas and exports a small JPEG data URL. First attempt uses `crossOrigin='anonymous'` and retries without it, so a protocol without CORS headers still degrades gracefully; a 9s watchdog and a max-2-concurrent queue keep decodes bounded.
- Results live in the `mediaThumbnails` store (item id → data URL). This is a session cache, deliberately NOT persisted to settings/storage — frames regenerate lazily as cards mount; capture failures are remembered for the session only.
- Folder cards show a representative frame from their first direct child (`LibraryFolder.representativeId`, chosen by `pickRepresentative` for roots, nested subfolders and import-derived groups alike); the view layer overlays a dark gradient so the folder icon chip and labels stay readable.
- Applies only to video files; audio items keep placeholders.
- Committed as `3f255cd`; `svelte-check` 0 errors / 0 warnings, `vite build` clean.

### Fixed — Folder upload rule applies to every root card

- The "upload already-in-library folder → navigate instead of import" rule previously only worked reliably for the seeded `~/Videos`-like cases and only at depth 1; the browser (`webkitRelativePath`) upload path had three defects: picking any root card's own name reset the breadcrumb to the Library level (returned empty segments), only direct subfolders of scanned roots matched, and import-derived top-level groups never navigated (re-uploading an already-imported folder duplicated its files).
- Replaced `findScannedSubfolder` with `findLibraryFolderChain`, an any-depth matcher: the pick may be any root card itself, any descendant of one (breadcrumb rebuilt from root to the matched level; shallowest same-name match wins), or an already-imported top-level group. The rule now covers every root-level card (configured seeds, Settings additions, adopted folders, import-derived groups), not just `~/Videos`.
- The desktop native-dialog path (`importLibraryFolderPath`) already handled every configured root at any depth and is unchanged.
- Committed as `96cde94`; `svelte-check` 0 errors / 0 warnings.

### Added — Native folder dialog for "Add folder…"

- The "Add folder…" menu item now opens the OS-native folder picker in the desktop shell (Tauri dialog plugin, registered in `main.rs` plus the `dialog:default` capability) instead of the HTML `webkitdirectory` input, which rendered a plain file picker under WebKitGTK.
- Picked folder handling follows the library rules: a folder inside a configured root navigates the view into it (may be the root itself or any deeper descendant; the breadcrumb is rebuilt from the chain via `importLibraryFolderPath`); a folder outside every configured root is adopted as a new configured root so the scanner gives it its own top-level card next to the existing ones, subtree intact.
- Browser preview keeps the previous `webkitdirectory` fallback with its existing upload/navigate behavior.
- Committed as `a54949e` (adds the `tauri-plugin-dialog` crate and the `@tauri-apps/plugin-dialog` package); `svelte-check` 0 errors / 0 warnings, `cargo test` passes 4 of 4.

### Changed — Library levels behave like a file manager

- The Library (Videos) page now navigates strictly level by level: the Library root lists only folder cards (configured roots such as Videos, plus import-derived roots) and loose imports with no folder info — it no longer dumps the whole media pool flat.
- Opening a folder lists only that folder's direct child subfolders and files; deeper files stay inside their subfolder cards (`filteredItems` now scopes by breadcrumb).
- Subfolder cards now derive from the combined imported+scanned pool, so disk-scanned subfolders (e.g. `~/Videos/Camera`, OBS, Screencasts, vids) render as cards with direct/recursive item counts; folder-item counts read the combined pool instead of imports only.
- The address-bar resolver resolves root-level paths against the same folder cards the UI shows; the redundant imports-only `libraryFolders` store was removed.
- Committed as `e595669`; `svelte-check` 0 errors / 0 warnings.

### Fixed — Videos folder scan pipeline

- Tauri command arguments now use the camelCase keys Tauri v2 expects (`root`/`maxDepth`/`includeHidden`, `kind`); `scan_library_dir` previously failed arg binding and silently logged "Scan failed".
- TypeScript scan types match the Rust structs' `#[serde(rename_all = "camelCase")]` output (`relativePath`, `sizeBytes` instead of snake_case); scan-file mapping no longer throws `undefined is not an object`, and subfolders now derive correctly from the scanned relative paths.
- Scan result types are single-sourced from `src/lib/tauriFs.ts` (`mock.ts` re-exports instead of duplicating definitions).
- Bootstrap no longer starts two concurrent root scans (settings subscriber re-entry guard).

### Verified

- End-to-end in `dev:tauri`: the default `~/Videos` folder is seeded and persisted (`libraryDefaultSeeded`), the disk scan runs, and subfolder cards (e.g. Camera, OBS, Screencasts, vids) render with counts.
- `svelte-check` reports 0 errors and 0 warnings; `cargo test` passes 4 of 4.

## 2026-11-07

### Added — Videos folder tree backed by Tauri disk scanning

Recorded here as one entry — feature plus companion fixes — since the bulk of the work landed through the autosave commits (`925b2bd`, `614f40d`) and was finished by `4384b7e` and `0b0091e`.

- The Videos page now opens on a **Library root of folder cards**. The platform default videos folder (`~/Videos` on Linux and macOS, `C:\Users\<user>\Videos` on Windows) is seeded automatically on the first desktop run, persisted through `settings.libraryFolders` plus the new `libraryDefaultSeeded` flag; folders are still added, removed and reordered in Settings as before.
- Opening a folder lists the **subfolders that contain media** (any depth, empty ones skipped) as folder cards above the files, in both grid and list view modes. Folder cards show direct plus recursive item counts.
- **Two new Tauri commands**: `default_media_dir` (xdg-user-dir VIDEOS / `%USERPROFILE%\Videos` with a `HOME` fallback) and `scan_library_dir` (bounded-depth walkdir scan filtered to media extensions — mp4, m4v, mkv, webm, mov, avi, ogv, mp3, m4a, aac, flac, ogg, oga, opus, wav, wma, mka — with hidden subtrees pruned, symlinks skipped and deterministic ordering). The asset protocol is enabled scoped to `$HOME/**`, so scanned files stream into `<video>` and durations are probed via metadata preload.
- **Upload rule:** "Add folder…" on a folder that already exists inside `~/Videos` (or any configured root) does not import it again — the UI navigates into that subfolder. Any other folder imports as one self-contained top-level folder card next to Videos, subtree intact.
- Same-name sibling folders are disambiguated for display only as `Name[ParentName]`; breadcrumbs and typed paths stay canonical.
- Watched state and progress for scanned files reuse the existing `vlc.watch.v1` storage, keyed by absolute file path (no new storage keys).
- **Browser preview fallback:** with no Tauri, scans are unavailable; imports still drive the tree and the default folder is not seeded.

### Fixed — narrow-pane layout

- The library toolbar's right cluster no longer overflows narrow panes; the search field shrinks with the width instead of pushing controls out (`LibraryToolbar.svelte`).
- The main content area can no longer be scrolled horizontally out of position (`overflow-x: clip` on the content region in `App.svelte`).

### Changed — documentation

- Status rows in [README.md](../README.md) and [README.as-twi.md](../README.as-twi.md) now list the Videos-folder disk scanning as implemented, and the Planned row narrows to library metadata/artwork and the remaining native-integration gaps.
- [design/02-redesign-vision.md](design/02-redesign-vision.md) gained a shipped **Videos folder tree** row in the current-status table, a folder-tree bullet under the Library target, and a narrowed Planned section.

### Verified

- `bun run check` reports **0 errors and 0 warnings**; `bunx vite build` succeeds.
- `cargo test` passes 4 of 4 tests against the new Tauri library commands.

## 2026-11-06

### Added — compact library sorter and view modes

- Extracted the library toolbar's sort dropdown into a shared `src/components/SortMenu.svelte` component, so the video page and the compact library panel now use the exact same control (icon trigger, "Sort by" radio menu, optional ascending/descending direction row). The video page's markup is unchanged.
- The compact library panel now uses that shared sorter (no more native `<select>`) and gains a **grid/list** layout switcher per tab, matching the browse pages: list rows sit in a bordered panel group and grid cards follow `MediaCard` styling with duration chips and resume progress bars.
- Saved watch-later and history items with a playable source are now draggable to the queue (`application/x-vlc-track` payload unchanged), matching the drawer's footer hint.
- Playing a bookmark now resumes at the bookmarked timestamp instead of the start of the media.
- `bun run check` reports 0 errors and 0 warnings; `bunx vite build` succeeds.

## 2026-11-05

### Fixed — checks and volume cone

- Removed the unused `fullscreen` export from `CompactLibraryOverlay.svelte` and the matching prop from `PlayerView.svelte`; `bun run check` now reports **0 errors and 0 warnings**.
- Verified the restored left-pointing volume cone orientation and left→right accent fill in `TransportBar.svelte`.

### Changed — documentation

- Status tables in `README.md` and `README.as-twi.md` now mark the next-episode countdown, editable library address bar, details view, saved-items tabs and queue repeat/shuffle as implemented.
- [design/02-redesign-vision.md](en/design/02-redesign-vision.md) moved finished items out of **Planned** and refreshed the current-status tables (next-episode prompt, address bar and details, playlist reordering and drop, saved-items overlay, queue management).
- [design/01-design-system.md](en/design/01-design-system.md) documents the countdown prompt alongside the compact **Next** button.

## 2026-11-04

### Fixed — transport volume cone

- Restored original left‑pointing volume cone orientation in `TransportBar.svelte` while preserving correct fill behavior (fill grows left→right as volume increases, thumb tracks correctly).

## 2026-10-31

### Changed — project name to Kanea

- Renamed the project to **Kanea** — the Twi word for "light" — across the app, configuration, documentation and READMEs.
- `package.json` / `package-lock.json` / `bun.lock` now use `kanea`.
- `src-tauri/Cargo.toml` and `Cargo.lock` now use `kanea`.
- `tauri.conf.json` now uses `productName: "Kanea"`, `identifier: "com.kanea.player"` and `title: "Kanea"`.
- `index.html` now titles the page `Kanea` and describes it as a community-built desktop interface for VLC Media Player.
- `src/i18n/en.json` now uses `app.title: "Kanea"`, `context_menu.quit: "Quit Kanea"`, `aria.context_menu: "Kanea context menu"`, and the settings hints reference Kanea instead of VLC.
- `src/components/WelcomeScreen.svelte` says "Welcome to Kanea"; `src/components/ContextMenu.svelte` says "Quit Kanea"; `src/views/SettingsView.svelte` and `src/views/PlayerView.svelte` now reference Kanea.
- `src/stores/settings.ts` and `src/components/settings/NetworkPanel.svelte` now use the `Kanea/1.0` user agent.
- `src/components/settings/ExportImportPanel.svelte` now exports `kanea-settings.json`.
- Both READMEs, the project overview, the design system, the design reference, the setup guide, the contributing guide and the license scope now brand the project Kanea while keeping the VLC cone, the `VLC Redesign (Community)/` design-reference folder and the VideoLAN boundary intact.
- The `application/x-vlc-track` drag payload and the `vlc.*.v1` persistence keys are unchanged.

### Added — design attribution

- Credited [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) for the VLC redesign concept and the design exports in `VLC Redesign (Community)/` across both READMEs, the project overview, the design system, the design reference inventory and the license scope.
- Clarified that the design exports are visual reference only, remain the creator's work and are not covered by the MIT license.
- Updated the contributing guide and [LICENSES/README.md](../../LICENSES/README.md) so contributors do not treat the exports as MIT-licensed project assets.

### Changed — contribution standards

- Rewrote [CONTRIBUTING.md](../CONTRIBUTING.md) to document atomic commits, Conventional Commit types and scopes, message and authorship rules, the `/docs/{lang}/{domain}/NN-topic.md` structure, required `OVERVIEW.md` and `CHANGELOG.md` files, and the i18n and translation workflow.
- Updated the **Contributing** sections in both READMEs to point at the commit, documentation and translation standards.

### Added — internationalization guide

- Added [guides/03-internationalization.md](guides/03-internationalization.md): language tags and file patterns, required `OVERVIEW.md` and `CHANGELOG.md` files, source-of-truth and synchronization rules, landing-page switchers, Asante Twi guidance, terminology, adding a language and a translation pull-request checklist.
- Linked the guide from [OVERVIEW.md](OVERVIEW.md) and both README documentation tables.

### Added — contributing and licensing

- Added [CONTRIBUTING.md](../CONTRIBUTING.md): development setup, project layout, design rules, coding conventions, checks, commit style, pull-request flow, documentation expectations and licensing.
- Added the root [LICENSE](../../LICENSE) with the MIT license for the UI redesign source and original documentation.
- Added [LICENSES/LGPL-2.1.txt](../../LICENSES/LGPL-2.1.txt) with the GNU Lesser General Public License 2.1 text for libvlc and VLC-derived components.
- Added [LICENSES/README.md](../../LICENSES/README.md) documenting the two license scopes, third-party dependencies and the VideoLAN trademark boundary.
- Added MIT and LGPL badges plus **Contributing** and **License** sections to both READMEs, and linked the contributing guide from [OVERVIEW.md](OVERVIEW.md).

### Added — bilingual documentation

- Added [docs/README.md](../README.md), the English documentation landing page: project summary, feature highlights, documentation index, quick-start commands, status labels, tech stack and contributing notes.
- Added [docs/README.as-twi.md](../README.as-twi.md), the Asante Twi translation of the landing page, with the same structure and links back to the English documentation.
- Added shields.io badges for the version, platforms, Tauri, Svelte, TypeScript, Tailwind, Bun, GitHub stars, forks, issues, last commit and docs languages, plus a **Project at a glance** statistics grid.
- Added a **Download** section linking [GitHub Releases](https://github.com/quabynahdavis/vlc-svelte/releases) and a from-source quick start.
- Added a screenshot gallery under `docs/assets/screenshots/`: player, library, music, settings, layout editor, add-to-playlist, compact library and light theme. The VLC cone mark is copied to `docs/assets/vlc.svg`.
- Both READMEs carry a language switcher at the top and bottom: **English** · **Asante Twi**.
- Updated [OVERVIEW.md](OVERVIEW.md) to link the language landing pages, show the new docs tree and clarify that detailed documentation remains English-only while the Asante Twi README is a translated entry point.

### Added — shell and player

- **Consolidated application menu**: the title-bar menu button opens the full menu (playback, video, audio, subtitle, playlist, open media, settings, layout, welcome, quit); right-click opens a shorter playback-focused menu that keeps **Hide UI**.
- **Compact library overlay** in the player, available windowed and fullscreen: search, watched/unwatched filter, sort, progress rows, add-media menu and drag-to-queue. Escape closes it and focus returns to the trigger.
- **Welcome screen** for first-run theme, accent, interface language and library folders, persisted under `vlc.onboarding.v1`; it can be reopened from the menu.
- **Layout editor** in Settings: reorder the navigation rail and right-dock tabs by drag or arrow buttons, toggle secondary player controls, reset to defaults. Persisted under `vlc.layout.v1`.
- **Drag-to-queue** from library cards/rows, music rows and the compact overlay using a shared `application/x-vlc-track` payload; the playlist panel shows a drop hint and appends without interrupting playback.
- **Add-to-playlist** dialog with playlist selection and inline creation, opened from library and music row hover actions. Playlist contents remain session-only; pins persist under `vlc.playlists.pins.v1`.
- **Player-control visibility** now follows the layout store; previous/play/next, elapsed time and the seek bar stay fixed.
- **Right-dock bookmarks/chapters** tab, subtitle timeline and per-show defaults, audio track/output-device selection, video filter previews, music genres and waveform strip, saved network streams, settings profiles and a separate hotkeys window are documented as implemented.

### Changed — documentation

- Updated [design/02-redesign-vision.md](design/02-redesign-vision.md): replaced the stale uncommitted/planned split with implemented tables for the shell, player, media, queue and settings, and a shorter list of genuine gaps (full next-episode countdown, address bar/details view, native scanning/metadata, persistent blob media, playlist drag-reordering, native playback).
- Updated [architecture/02-frontend.md](architecture/02-frontend.md): consolidated menu and welcome/layout/add-to-playlist wiring, compact overlay, music genres, saved streams, sixteen settings categories, new components/stores (`layout`, `onboarding`, `playlistTarget`, `subtitleProfiles`, `bookmarks`, `settingsProfiles`, `avPrefs`, `dragTrack`) and the full persistence-key table.
- Updated [OVERVIEW.md](OVERVIEW.md) for the new shell surfaces and settings count.

### Verified

- `bun run check` reports **0 errors and 0 warnings**.
- `bunx vite build` succeeds and writes `src-tauri/gen/dist/`.

## 2026-10-29

### Added — redesign vision and implementation notes

- Added [design/02-redesign-vision.md](design/02-redesign-vision.md): the target direction for the player, library, music, playlists, network and settings, with separate **Implemented**, **Implemented in the current working tree (uncommitted)** and **Planned — not implemented** sections.
- Documented the uncommitted transport work in `src/components/TransportBar.svelte`: a larger play button, cone-shaped volume control, thicker seek bar with hover thumbnails, and a compact **Next** button in the last 20 seconds.
- `LibraryAddMenu` adds **Add file…**, **Add folder…** and **Add network stream…** actions, with hidden HTML pickers, URL validation, duration probing and a dismissible import-status line.
- Library watched/unwatched filtering, a `watched` sort key and clickable breadcrumb navigation.
- Fullscreen now targets a shell containing the stage and transport, with a top bar for the title, picture-in-picture and exit-fullscreen; chrome auto-hides after 2.5 seconds and returns on pointer/focus/keyboard activity.
- `TransportBar` gains a larger play button, cone volume, a thicker seek bar with hover previews and a compact **Next** button.

### Changed — documentation

- Rewrote [design/01-design-system.md](design/01-design-system.md) around the implemented semantic tokens, dark and warm-neutral light palettes, runtime accent derivation, Tailwind mappings, shape language, icon rules, dark exceptions and current transport specification.
- Rewrote [architecture/01-overview.md](architecture/01-overview.md) and [architecture/02-frontend.md](architecture/02-frontend.md) to match the implemented shell, six views, right dock, fourteen settings categories, library imports, fullscreen/PiP, stores, persistence keys and known gaps.
- Updated [OVERVIEW.md](OVERVIEW.md), [guides/01-setup.md](guides/01-setup.md), [guides/02-design-reference.md](guides/02-design-reference.md) and [architecture/03-tauri-backend.md](architecture/03-tauri-backend.md) for the current scripts, capabilities, decorations setting and design status.

### Changed — UI

- `feat: Use raised surfaces for view interactions` (`2529a37`) — Music, Network, Playlists and Recent rows now use the raised surface token for hover/selection instead of ad-hoc fills.

### Verified

- `bun run check` reports **0 errors and 0 warnings**.
- The documented frontend build output remains `src-tauri/gen/dist/`.

## 2026-10-27

### Added

- Dual-theme token layer with a warm-neutral light palette and `-rgb` companions (`ba54024`).
- Custom-or-system title bar setting, applied to the native window at runtime (`e1d8309`).
- Shared grid/list/compact view-mode control and per-scope view-mode store (`04faa77`).
- Sorting across Library, Music and Playlists, with stable direction-aware comparators (`9c3a30f`).
- Player stage gestures: delayed single click, double-click fullscreen and wheel volume with a HUD (`898ba0b`).
- Tauri v2 window-control capabilities for minimise, maximise, close, dragging and decoration switching (`fe3daec`).
- `svelte-check` script; `dev` now delegates to `dev:tauri`, and `build` to `bunx tauri build` (`22a7137`).

### Changed

- Migrated the shell (`cc1a8df`), settings and dock panels (`9c4449f`), and browse views (`6c1aacb`) from literal colours to semantic tokens.
- Documented the verified frontend build and the Tauri window permissions (`5fd2cc0`).

### Fixed

- Resolved the Svelte compile errors that blocked `vite build` (`7206d11`): component `class:` modifiers, a duplicate `class` attribute, the dynamic input `type`, and the `DEFAULT_HOTKEYS` export.
- Kept transport and `<video>` volume state in sync (`5b40be5`).
- Resolved component event and icon-map type errors (`7b879d3`).
- Repaired the `DropZone` component (`fc599b9`).
- Supported disabled selects and corrected toggle ARIA labels (`6e5ed2e`).
- Normalised persisted accent hex casing (`208f962`).
- Repaired the visualizer mode and right-dock layout (`49824cd`).
- Removed stray Vite timestamp files and ignored test artifacts (`cd59bdf`, `96586d7`).

## 2026-10-26

### Added — application UI

- Initial Tauri + Svelte + Vite + Tailwind scaffold (`f06be1b`): `App.svelte`, `PlayerView.svelte`, `SettingsView.svelte`, Tauri configuration and placeholder icons.
- Design tokens and application shell (`80abc9c`): `TitleBar`, `IconRail`, `ContextMenu`, settings modal scaffold, Tailwind `vlc.*` palette and base styles.
- Library breadcrumb toolbar and responsive media grid (`ac3c088`): `LibraryView`, `LibraryToolbar`, `MediaCard` and the library store.
- Player playlist panel and transport controls (`74a7159`): `PlayerView`, `PlaylistPanel`, a synced `<video>` element, seek/volume/buffered state and `TransportBar`.
- Context menu and property panel (`6f88ab2`).
- Full settings modal with General, Audio and Subtitles panels (`093d82a`).
- Right sidebar for audio, subtitles, video and queue (`f135a89`), then a canvas overlay with per-media tabs (`c3691b4`).
- Music, Network, Recent and Playlists screens (`ed59392`).
- Global fuzzy search (`a8a348f`), audio visualizer (`f934ecf`), settings reset (`3178404`) and JSON export/import (`e5b496d`).
- English locale scaffold and translation helper (`ea7ffdc`).

### Corrected — design tokens

- Replaced the approximate palette with values measured from the PNG exports: accent `#D37918`, pressed/icon dark `#AB6314`, fill start `#371F06`, app `#0E0E0E`, panel `#181818`, panel alt `#191919`, card `#1B1B1B`, raised `#232323`, border `#373737`, border subtle `#262626`, and text `#EAEAEA` / `#B8B8B8` / `#8F8F8F` / `#6B6B6B` (`8c89b45`).
- Recorded the 25 PNGs as the source of truth; the ~30 MB SVG is a collage of the same 21 screen images and adds no vector data.
- Documented the implemented components and their files, and replaced the interim-palette note with the measured token set.

### Added — design system

- Added [design/01-design-system.md](design/01-design-system.md): canonical measured colour, typography, radius, spacing and elevation tokens, plus component specifications and implementation status.
- Documented the source exports in `VLC Redesign (Community)/` by filename, including the 21 screen images and the small frame/disc/icon assets.

### Changed — Tauri v2 migration (complete)

- `src-tauri/tauri.conf.json` now uses the v2 schema: `$schema` `https://schema.tauri.app/config/2`, top-level `productName`, `version`, `identifier` and `bundle`, `build.devUrl`, `build.frontendDist`, `app.windows` and `app.security` (commit `9d6fa1a`).
- `src-tauri/src/main.rs` now resolves the window with `app.get_webview_window("main")` and imports `tauri::Manager`; the v1 `get_window` call is gone.
- `src-tauri/Cargo.toml` uses `tauri = "2"` and `tauri-build = "2"` with empty feature sets; the v1 `dialog-all` / `fs-all` / `shell-all` allowlist features were removed.
- `build.beforeDevCommand` is `bun run dev:frontend`; `build.beforeBuildCommand` is `bun x vite build`. Tauri no longer re-enters itself through the npm scripts.
- The JavaScript packages were already on `@tauri-apps/api` and `@tauri-apps/cli` `^2.0.0`.

### Fixed — frontend build

- Fixed the Vite output path in commit `b6c72c0`: `build.outDir` changed from `../src-tauri/gen/dist` to `src-tauri/gen/dist`, so the bundle is written inside the project at `src-tauri/gen/dist/` and matches `build.frontendDist` (`gen/dist`, resolved relative to `src-tauri/`).
- Resolved the frontend build issue in `src/views/SettingsView.svelte` (commit `da32cfd`, "fix: resolve build issues").

### Documentation cleanup

- docs cleanup: French removed, English-only structure. `docs/fr/` and every French mirror link are gone; `docs/en/` is the sole language root with `OVERVIEW.md` and `CHANGELOG.md`.
- Deleted the redundant root-level `docs/OVERVIEW.md` and `docs/CHANGELOG.md`; the required pair now lives only at the language root, `docs/en/`.
- Deleted the duplicate `OVERVIEW.md` / `CHANGELOG.md` files from `docs/en/architecture/` and `docs/en/guides/`. Domain folders contain only numbered topic documents.

## Known gaps

- Tauri native integration is partial: window capabilities and custom/system decorations exist, and the library commands (`scan_library_dir`, `default_media_dir`) registered through `invoke_handler` are the first native bridge, but there are no plugin crates, native file dialogs or media-metadata commands, and `app.security.csp` is `null`.
- Library folder trees for configured roots are scanned from disk on the desktop (seeded with the default Videos folder); music, playlist, recent and network data are mock data, mock items use the bundled `public/demo/sample.mp4`, while imported files/streams — and everything in a browser preview, where scans are unavailable — are session-only.
- There is no URL router; navigation, settings visibility, the property dock and hidden chrome are in-memory and reset on reload.
- Settings and view modes persist; the player queue does not.
- The full next-episode prompt, subtitle timeline, audio output-device selection, video filter previews, saved network streams, editable address bar, details view and library empty-state add actions are planned, not implemented. Picture-in-picture, fullscreen chrome auto-hide, watched filtering and library imports exist in the working tree but are uncommitted.
- `src-tauri/icons/` still contains default Tauri placeholder icons; Inter is loaded from Google Fonts rather than self-hosted; true two-tone menu glyphs are not rendered.
- No automated test suite is configured.
