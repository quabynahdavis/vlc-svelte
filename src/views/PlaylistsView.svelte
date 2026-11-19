<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ChevronRight,
    GripVertical,
    ListMusic,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Trash2,
  } from 'lucide-svelte';
  import { isTrackDrag, readTrackDrag, startTrackDrag } from '../lib/dragTrack';
  import type { MediaItem } from '../lib/mock';
  import {
    mediaItemForPlaylistTrack,
    playlistTrackIsVideo,
  } from '../lib/playlistMedia';
  import {
    addTrackToPlaylist,
    deletePlaylist,
    movePlaylistTrack,
    renamePlaylist,
    type Playlist,
    type PlaylistTrack,
    pinnedPlaylistIds,
    playlistsData,
    playlistsSearch,
    playlistsSelectedId,
    playlistsSort,
    playlistsSortDirection,
    type PlaylistsSortKey,
    type SortDirection,
  } from '../stores/playlists';
  import { playlistsViewMode } from '../stores/viewModes';
  import { navigate } from '../stores/navigation';
  import { currentTrack, setQueue, type Track } from '../stores/player';
  import { libraryItems } from '../stores/library';
  import { musicTracks } from '../stores/musicLibrary';
  import { watchEntries } from '../stores/watch';
  import { openMediaContextMenu } from '../stores/ui';
  import CreatePlaylistDialog from '../components/CreatePlaylistDialog.svelte';
  import PlaylistRenameField from '../components/PlaylistRenameField.svelte';
  import LibraryDetails from '../components/LibraryDetails.svelte';
  import MediaCard from '../components/MediaCard.svelte';
  import MediaListRow from '../components/MediaListRow.svelte';
  import FuzzySearch from '../components/FuzzySearch.svelte';
  import SortMenu from '../components/SortMenu.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';

  interface SortOption {
    key: PlaylistsSortKey;
    label: string;
  }

  interface PlaylistSection {
    id: 'pinned' | 'all';
    label: string;
    items: Playlist[];
  }

  const sortOptions: SortOption[] = [
    { key: 'manual', label: 'Manual' },
    { key: 'name', label: 'Name' },
    { key: 'date', label: 'Date' },
    { key: 'count', label: 'Item count' },
  ];

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app';

  $: selected = $playlistsSelectedId;

  let query = '';
  let searchKey = 0;

  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
    playlistsSearch.set(query);
  }

  function clearSearch() {
    query = '';
    playlistsSearch.set('');
    // FuzzySearch owns its input value; remounting it clears the visible field.
    searchKey += 1;
  }

  // Inside a playlist the query filters tracks, so the root list stays intact underneath.
  $: filtered = $playlistsData.filter((item) =>
    $playlistsSelectedId ? true : item.name.toLowerCase().includes(query),
  );

  /** `manual` keeps source order; everything else is stable and direction-aware. */
  function sortPlaylists(
    items: Playlist[],
    key: PlaylistsSortKey,
    direction: SortDirection,
  ): Playlist[] {
    if (key === 'manual') return items;
    const sign = direction === 'asc' ? 1 : -1;

    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        let result = 0;

        if (key === 'name') result = collator.compare(a.item.name, b.item.name);
        else if (key === 'date') result = a.item.lastModified - b.item.lastModified;
        else result = a.item.trackCount - b.item.trackCount;

        if (result === 0) return a.index - b.index;
        return result * sign;
      })
      .map(({ item }) => item);
  }

  $: sortedPlaylists = sortPlaylists(filtered, $playlistsSort, $playlistsSortDirection);
  $: pinnedIds = $pinnedPlaylistIds;
  $: pinnedPlaylists = sortedPlaylists.filter((playlist) => pinnedIds.includes(playlist.id));
  $: unpinnedPlaylists = sortedPlaylists.filter((playlist) => !pinnedIds.includes(playlist.id));
  $: sections = buildSections(pinnedPlaylists, unpinnedPlaylists);

  function buildSections(pinned: Playlist[], unpinned: Playlist[]): PlaylistSection[] {
    const sections: PlaylistSection[] = [];

    if (pinned.length > 0) sections.push({ id: 'pinned', label: 'Pinned', items: pinned });
    // When every playlist is pinned, an empty "All playlists" heading is noise.
    if (unpinned.length > 0 || pinned.length === 0) {
      sections.push({ id: 'all', label: 'All playlists', items: unpinned });
    }

    return sections;
  }

  function selectSortKey(key: string) {
    if (key !== 'manual' && key !== 'name' && key !== 'date' && key !== 'count') return;
    playlistsSort.set(key);
  }

  function toggleSortDirection() {
    if ($playlistsSort === 'manual') return;
    playlistsSortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
  }

  function formatDuration(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function playlistTrackLabel(count: number): string {
    return count === 1 ? '1 track' : `${count} tracks`;
  }

  let detailsItemId: string | null = null;

  function openPlaylist(id: string) {
    detailsItemId = null;
    cancelRename();
    clearSearch();
    playlistsSelectedId.set(id);
  }

  function closePlaylist() {
    detailsItemId = null;
    cancelRename();
    clearSearch();
    playlistsSelectedId.set(null);
  }

  function goBack() {
    if (detailsItemId) {
      void closeDetails();
      return;
    }
    closePlaylist();
  }

  /** Queue the open playlist from the clicked track, using each track's own source. */
  function playPlaylistTrack(index: number) {
    if (!activePlaylist) return;

    const clicked = activePlaylist.tracks[index];
    if (!clicked?.src) return;

    const tracks: Track[] = activePlaylist.tracks
      .filter((t) => t.src)
      .map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        src: t.src,
      }));
    const start = tracks.findIndex((t) => t.id === clicked.id && t.src === clicked.src);
    if (start < 0) return;

    setQueue(tracks, start);
    navigate('home');
  }

  let createOpen = false;
  let createTrigger: HTMLElement | null = null;

  function openCreateDialog(event: MouseEvent) {
    createTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    createOpen = true;
  }

  async function togglePin(id: string) {
    pinnedPlaylistIds.update((ids) =>
      ids.includes(id) ? ids.filter((pinnedId) => pinnedId !== id) : [...ids, id],
    );

    // Pinning moves the row between two keyed sections, which recreates its
    // DOM; restore focus to the same pin control for keyboard users.
    await tick();
    const pins = Array.from(document.querySelectorAll<HTMLElement>('[data-pin-id]'));
    pins.find((pin) => pin.dataset.pinId === id)?.focus();
  }

  function handleCreate(playlist: Playlist) {
    detailsItemId = null;
    playlistsData.update((items) => [playlist, ...items]);
    playlistsSelectedId.set(playlist.id);
    clearSearch();
    createOpen = false;
  }

  function deleteOpenPlaylist() {
    const id = $playlistsSelectedId;
    if (!id) return;
    deletePlaylist(id);
    closePlaylist();
  }

  let renamingId: string | null = null;
  let renameValue = '';
  let renameError = '';

  function cancelRename() {
    renamingId = null;
    renameValue = '';
    renameError = '';
  }

  function startRename(id: string, name: string) {
    renamingId = id;
    renameValue = name;
    renameError = '';
  }

  function commitRename() {
    if (!renamingId) return;
    const result = renamePlaylist(renamingId, renameValue);
    if (result === 'empty') {
      renameError = 'Enter a playlist name.';
      return;
    }
    if (result === 'duplicate') {
      renameError = 'A playlist with that name already exists.';
      return;
    }
    cancelRename();
  }

  $: activePlaylist = $playlistsData.find((playlist) => playlist.id === selected) ?? null;
  /** Search filters the surface on screen: playlist names at the root, track title or artist inside one. */
  $: visibleTracks = activePlaylist
    ? activePlaylist.tracks.filter((track) => {
        if (!query) return true;
        return (
          track.title.toLowerCase().includes(query) ||
          track.artist.toLowerCase().includes(query)
        );
      })
    : [];
  $: itemCount = activePlaylist ? visibleTracks.length : sortedPlaylists.length;

  /** Video rows reuse the library card. Audio rows keep the playlist layout. */
  function mediaItemForTrack(track: PlaylistTrack): MediaItem | null {
    const libraryItem = $libraryItems.find((item) => item.id === track.id) ?? null;
    const inMusic = $musicTracks.some((item) => item.id === track.id);
    if (!playlistTrackIsVideo(track, libraryItem !== null, inMusic)) return null;
    return mediaItemForPlaylistTrack(track, libraryItem, $watchEntries);
  }

  $: detailsItem = (() => {
    if (!detailsItemId || !activePlaylist) return null;
    const track = activePlaylist.tracks.find((entry) => entry.id === detailsItemId);
    if (!track) return null;
    const libraryItem = $libraryItems.find((item) => item.id === track.id) ?? null;
    const inMusic = $musicTracks.some((item) => item.id === track.id);
    if (!playlistTrackIsVideo(track, libraryItem !== null, inMusic)) return null;
    return mediaItemForPlaylistTrack(track, libraryItem, $watchEntries);
  })();
  $: detailsBreadcrumb = detailsItem?.relativePath
    ? detailsItem.relativePath.split('/').filter(Boolean)
    : ['Playlists', activePlaylist?.name ?? 'Playlist'];

  function openDetails(item: MediaItem): void {
    detailsItemId = item.id;
  }

  async function closeDetails(): Promise<void> {
    const id = detailsItemId;
    detailsItemId = null;
    await tick();
    if (id) document.querySelector<HTMLElement>(`[data-media-info="${id}"]`)?.focus();
  }

  function handleDetailsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !detailsItemId) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    void closeDetails();
  }

  onMount(() => {
    function handleShowMediaInfo(event: Event): void {
      const itemId = (event as CustomEvent<string>).detail;
      if (!itemId || !activePlaylist) return;
      const track = activePlaylist.tracks.find((entry) => entry.id === itemId);
      if (!track || !mediaItemForTrack(track)) return;
      detailsItemId = itemId;
    }

    window.addEventListener('vlc-show-media-info', handleShowMediaInfo);
    return () => window.removeEventListener('vlc-show-media-info', handleShowMediaInfo);
  });

  function trackSourceIndex(trackId: string, src: string): number {
    if (!activePlaylist) return -1;
    return activePlaylist.tracks.findIndex((entry) => entry.id === trackId && entry.src === src);
  }

  /* ---------------------------------------------------------------------------
   * Reordering tracks inside the open playlist (Task A)
   * ------------------------------------------------------------------------- */

  /**
   * Private MIME type for intra-playlist reordering. It is deliberately
   * different from `TRACK_DRAG_TYPE`: a reorder drag must not be mistaken for
   * a library track being dropped onto a playlist.
   */
  const PLAYLIST_TRACK_DRAG_TYPE = 'application/x-vlc-playlist-track';

  type DropPosition = 'before' | 'after';

  interface ReorderTarget {
    index: number;
    position: DropPosition;
  }

  let reorderDrag: { playlistId: string; fromIndex: number } | null = null;
  let reorderTarget: ReorderTarget | null = null;

  function hasPlaylistTrackDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(PLAYLIST_TRACK_DRAG_TYPE) ?? false;
  }

  function beginTrackReorder(event: DragEvent, fromIndex: number) {
    if (!activePlaylist || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    const track = activePlaylist.tracks[fromIndex];
    reorderDrag = { playlistId: activePlaylist.id, fromIndex };
    reorderTarget = null;

    if (track?.src) {
      startTrackDrag(event, {
        id: track.id,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        src: track.src,
      });
    }

    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(
      PLAYLIST_TRACK_DRAG_TYPE,
      JSON.stringify({ playlistId: activePlaylist.id, index: fromIndex }),
    );
    // Some browsers refuse to start a drag without a text/plain payload.
    event.dataTransfer.setData('text/plain', track?.title ?? '');
  }

  function endTrackReorder() {
    reorderDrag = null;
    reorderTarget = null;
  }

  function handleTrackDragOver(event: DragEvent, index: number) {
    if (!reorderDrag || !hasPlaylistTrackDrag(event)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    const row = event.currentTarget;
    if (!(row instanceof HTMLElement)) return;
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    reorderTarget = { index, position: after ? 'after' : 'before' };
  }

  function handleTrackDragLeave(event: DragEvent) {
    if (!reorderDrag) return;

    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(next)
    ) {
      return;
    }

    reorderTarget = null;
  }

  function handleTrackDrop(event: DragEvent, index: number) {
    if (!reorderDrag || !hasPlaylistTrackDrag(event)) return;

    event.preventDefault();
    event.stopPropagation();

    const { playlistId, fromIndex } = reorderDrag;
    const position: DropPosition =
      reorderTarget?.index === index ? reorderTarget.position : 'before';
    endTrackReorder();

    // Translate "before/after this row" into a final index after removal.
    let toIndex = position === 'after' ? index + 1 : index;
    if (fromIndex < toIndex) toIndex -= 1;
    if (toIndex === fromIndex) return;

    const playlist = movePlaylistTrack(playlistId, fromIndex, toIndex);
    const moved = playlist?.tracks[toIndex];
    if (playlist && moved) {
      announce(`Moved ${moved.title} to position ${toIndex + 1} of ${playlist.tracks.length}`);
    }
  }

  /** Keyboard equivalent of dragging a row: move it one slot up or down. */
  async function moveTrackBy(index: number, delta: -1 | 1) {
    if (!activePlaylist) return;

    const track = activePlaylist.tracks[index];
    const toIndex = index + delta;
    if (!track || toIndex < 0 || toIndex >= activePlaylist.tracks.length) return;

    const playlist = movePlaylistTrack(activePlaylist.id, index, toIndex);
    if (!playlist) return;

    announce(`Moved ${track.title} to position ${toIndex + 1} of ${playlist.tracks.length}`);

    // Keyed rows keep their DOM nodes, but a boundary button becomes disabled
    // after the move, so put focus on a control that can still act.
    await tick();
    const canContinue = toIndex + delta >= 0 && toIndex + delta < playlist.tracks.length;
    const preferredDelta = canContinue ? delta : -delta;
    const next =
      findTrackControl(track.id, preferredDelta) ?? findTrackControl(track.id, delta);
    (next ?? findTrackControl(track.id))?.focus();
  }

  function findTrackControl(trackId: string, moveDelta?: number): HTMLElement | undefined {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-track-control]'),
    );

    return controls.find((control) => {
      if (control.dataset.trackId !== trackId) return false;
      return moveDelta === undefined || Number(control.dataset.moveDelta) === moveDelta;
    });
  }

  /* ---------------------------------------------------------------------------
   * Dropping library tracks onto a playlist (Task B)
   * ------------------------------------------------------------------------- */

  let dropTargetId: string | null = null;
  let detailDragActive = false;

  let feedback = '';
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let announcement = '';

  function announce(message: string) {
    // Clear first so an identical repeated message is announced again.
    announcement = '';
    requestAnimationFrame(() => {
      announcement = message;
    });
  }

  function showFeedback(message: string) {
    feedback = message;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedback = '';
      feedbackTimer = null;
    }, 2800);
  }

  onDestroy(() => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
  });

  function addDroppedTrack(event: DragEvent, playlistId: string) {
    const track = readTrackDrag(event);
    const playlist = $playlistsData.find((item) => item.id === playlistId);
    if (!track?.src || !playlist) return;

    const added = addTrackToPlaylist(playlistId, {
      id: track.id,
      title: track.title,
      artist: track.artist ?? '',
      duration: track.duration,
      src: track.src,
    });

    showFeedback(
      added
        ? `Added “${track.title}” to ${playlist.name}`
        : `“${track.title}” is already in ${playlist.name}`,
    );
  }

  function handlePlaylistDragOver(event: DragEvent, playlistId: string) {
    // A reorder drag also carries the queue payload. Keep that drop on the
    // queue, and don't treat it as "add this track to another playlist".
    if (hasPlaylistTrackDrag(event) || !isTrackDrag(event)) {
      if (dropTargetId === playlistId) dropTargetId = null;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dropTargetId = playlistId;
  }

  function handlePlaylistDragLeave(event: DragEvent, playlistId: string) {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(next)
    ) {
      return;
    }

    if (dropTargetId === playlistId) dropTargetId = null;
  }

  function handlePlaylistDrop(event: DragEvent, playlistId: string) {
    if (dropTargetId === playlistId) dropTargetId = null;
    if (hasPlaylistTrackDrag(event) || !isTrackDrag(event)) return;

    event.preventDefault();
    event.stopPropagation();
    addDroppedTrack(event, playlistId);
  }

  function handleDetailDragOver(event: DragEvent) {
    if (!activePlaylist || hasPlaylistTrackDrag(event) || !isTrackDrag(event)) {
      detailDragActive = false;
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    detailDragActive = true;
  }

  function handleDetailDragLeave(event: DragEvent) {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(next)
    ) {
      return;
    }

    detailDragActive = false;
  }

  function handleDetailDrop(event: DragEvent) {
    detailDragActive = false;
    if (!activePlaylist || hasPlaylistTrackDrag(event) || !isTrackDrag(event)) return;

    event.preventDefault();
    addDroppedTrack(event, activePlaylist.id);
  }

  /** A drag can end anywhere (or be cancelled), so never leave stale state. */
  function handleWindowDragEnd() {
    dropTargetId = null;
    detailDragActive = false;
    endTrackReorder();
  }
</script>

<svelte:window on:dragend={handleWindowDragEnd} on:keydown={handleDetailsKeydown} />

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-4 sm:px-6">
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors {activePlaylist
        ? 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'
        : 'text-vlc-dim opacity-50'} {focusRing}"
      title="Back"
      aria-label="Go back"
      disabled={!activePlaylist}
      on:click={goBack}
    >
      <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>

    <nav
      class="flex min-w-0 items-center gap-1.5 text-[13px] leading-none"
      aria-label="Breadcrumb"
    >
      {#if activePlaylist}
        <button
          type="button"
          class="min-w-0 truncate whitespace-nowrap rounded-[4px] px-0.5 text-vlc-secondary transition-colors hover:text-vlc-text {focusRing}"
          title="Go to Playlists"
          on:click={closePlaylist}
        >
          Playlists
        </button>
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          class="shrink-0 text-vlc-muted"
          aria-hidden="true"
        />
        {#if renamingId === activePlaylist.id}
          <div class="w-52 min-w-0">
            <PlaylistRenameField
              bind:value={renameValue}
              error={renameError}
              label={`Rename ${activePlaylist.name}`}
              on:commit={commitRename}
              on:cancel={cancelRename}
              on:input={() => (renameError = '')}
            />
          </div>
        {:else}
          <span
            class="min-w-0 truncate whitespace-nowrap rounded-[4px] px-0.5 text-vlc-text"
            aria-current="page"
            title={activePlaylist.name}
          >
            {activePlaylist.name}
          </span>
        {/if}
      {:else}
        <span
          class="min-w-0 truncate whitespace-nowrap rounded-[4px] px-0.5 text-vlc-text"
          aria-current="page"
          title="Playlists"
        >
          Playlists
        </span>
      {/if}
    </nav>

    <div class="ml-auto flex min-w-0 items-center gap-1.5">
      <span class="mr-1 hidden whitespace-nowrap text-xs text-vlc-muted sm:inline" aria-live="polite">
        {itemCount}
        {itemCount === 1 ? 'item' : 'items'}
      </span>
      <div class="w-36 shrink sm:w-44 md:w-56">
        {#key searchKey}
          <FuzzySearch
            placeholder="Search…"
            label={activePlaylist ? 'Search tracks' : 'Search playlists'}
            on:search={handleSearch}
          />
        {/key}
      </div>
      {#if !activePlaylist}
        <SortMenu
          options={sortOptions}
          value={$playlistsSort}
          direction={$playlistsSort === 'manual' ? null : $playlistsSortDirection}
          onValueChange={selectSortKey}
          onToggleDirection={toggleSortDirection}
          label="Sort playlists"
        />
      {/if}
      <ViewModeToggle
        value={$playlistsViewMode}
        onChange={(mode) => playlistsViewMode.set(mode)}
        label="Playlist view mode"
      />
      {#if activePlaylist}
        {@const opened = activePlaylist}
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing} {pinnedIds.includes(opened.id)
            ? 'text-vlc-orangeText'
            : 'text-vlc-secondary'}"
          title={pinnedIds.includes(opened.id) ? `Unpin ${opened.name}` : `Pin ${opened.name}`}
          aria-label={pinnedIds.includes(opened.id) ? `Unpin ${opened.name}` : `Pin ${opened.name}`}
          aria-pressed={pinnedIds.includes(opened.id)}
          data-pin-id={opened.id}
          on:click={() => togglePin(opened.id)}
        >
          {#if pinnedIds.includes(opened.id)}
            <PinOff size={16} strokeWidth={1.75} aria-hidden="true" />
          {:else}
            <Pin size={16} strokeWidth={1.75} aria-hidden="true" />
          {/if}
        </button>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
          title={`Rename ${opened.name}`}
          aria-label={`Rename ${opened.name}`}
          on:click={() => startRename(opened.id, opened.name)}
        >
          <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
          title={`Delete ${opened.name}`}
          aria-label={`Delete ${opened.name}`}
          on:click={deleteOpenPlaylist}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      {/if}
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
        title="Create playlist"
        aria-label="Create playlist"
        aria-haspopup="dialog"
        aria-expanded={createOpen}
        on:click={openCreateDialog}
      >
        <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  </header>

  <div
    class="min-h-0 flex-1 overflow-y-auto"
    role="region"
    aria-label={activePlaylist ? `${activePlaylist.name} tracks` : 'Playlists'}
    on:dragover={handleDetailDragOver}
    on:dragleave={handleDetailDragLeave}
    on:drop={handleDetailDrop}
  >
    {#if activePlaylist}
      {#if detailDragActive}
        <div
          class="pointer-events-none sticky top-0 z-10 mx-4 mt-2 flex items-center justify-center gap-1.5 rounded-control border border-dashed border-vlc-orange/60 bg-vlc-panel/95 px-2 py-2 text-[11px] text-vlc-orangeText shadow-sm sm:mx-6"
          role="status"
        >
          <ListMusic size={13} strokeWidth={2} aria-hidden="true" />
          Drop to add to {activePlaylist.name}
        </div>
      {/if}

      {#if detailsItem}
        <LibraryDetails
          item={detailsItem}
          breadcrumb={detailsBreadcrumb}
          onBack={closeDetails}
          onPlay={(item) => {
            const index = activePlaylist.tracks.findIndex((entry) => entry.id === item.id);
            if (index >= 0) playPlaylistTrack(index);
          }}
        />
      {:else if activePlaylist.tracks.length === 0}
          <div class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div
              class="mb-3 flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
            >
              <ListMusic size={22} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <p class="text-sm font-medium text-vlc-secondary">This playlist is empty</p>
            <p class="mt-1 max-w-xs text-xs text-vlc-muted">
              Drag a track here from your library, or use Add to playlist on a track.
            </p>
          </div>
        {:else if visibleTracks.length === 0}
          <div class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div
              class="mb-3 flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
            >
              <ListMusic size={22} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <p class="text-sm font-medium text-vlc-secondary">No tracks match “{query}”</p>
            <p class="mt-1 text-xs text-vlc-muted">Try a different title or clear the search.</p>
            <div class="mt-4">
              <button
                type="button"
                class="rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text {focusRing}"
                on:click={clearSearch}
              >
                Clear search
              </button>
            </div>
          </div>
        {:else if $playlistsViewMode === 'grid'}
          <div
            class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {#each visibleTracks as track (track.id)}
              {@const i = trackSourceIndex(track.id, track.src)}
              {@const videoItem = mediaItemForTrack(track)}
              <div
                class="group relative rounded-control {reorderDrag?.fromIndex === i ? 'opacity-50' : ''}"
                role="group"
                aria-label={track.title}
                on:contextmenu={(event) => openMediaContextMenu(event, track.id)}
                on:dragover={(event) => handleTrackDragOver(event, i)}
                on:dragleave={handleTrackDragLeave}
                on:drop={(event) => handleTrackDrop(event, i)}
              >
                {#if videoItem}
                  <MediaCard
                    item={videoItem}
                    onSelect={() => playPlaylistTrack(i)}
                    on:info={(event) => openDetails(event.detail)}
                  />
                {:else}
                <button
                  type="button"
                  class="block w-full rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
                  title={`Play ${track.title}`}
                  on:click={() => playPlaylistTrack(i)}
                >
                  <div
                    class="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-vlc-border bg-vlc-card text-vlc-muted transition group-hover:border-vlc-borderStrong group-hover:bg-vlc-raised"
                  >
                    <ListMusic size={30} strokeWidth={1.5} aria-hidden="true" />
                    <span
                      class="absolute bottom-2 right-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] tabular-nums text-vlc-secondary"
                    >
                      {formatDuration(track.duration)}
                    </span>
                  </div>
                  <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text" title={track.title}>
                    {track.title}
                  </div>
                  <div class="truncate text-[11px] text-vlc-muted" title={track.artist}>
                    {track.artist}
                  </div>
                </button>
                {/if}

                <div class="mt-1 flex items-center gap-0.5">
                  <button
                    type="button"
                    draggable="true"
                    data-track-control
                    data-track-handle
                    data-track-id={track.id}
                    class="flex h-6 w-6 cursor-grab items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 active:cursor-grabbing"
                    title={`Drag ${track.title} to reorder`}
                    aria-label={`Drag ${track.title} to reorder`}
                    on:dragstart={(event) => beginTrackReorder(event, i)}
                    on:dragend={endTrackReorder}
                  >
                    <GripVertical size={13} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-track-control
                    data-track-id={track.id}
                    data-move-delta={-1}
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-vlc-muted"
                    title={`Move ${track.title} up`}
                    aria-label={`Move ${track.title} up`}
                    disabled={i === 0}
                    on:click={() => moveTrackBy(i, -1)}
                  >
                    <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-track-control
                    data-track-id={track.id}
                    data-move-delta={1}
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-vlc-muted"
                    title={`Move ${track.title} down`}
                    aria-label={`Move ${track.title} down`}
                    disabled={i === activePlaylist.tracks.length - 1}
                    on:click={() => moveTrackBy(i, 1)}
                  >
                    <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>

                {#if reorderTarget?.index === i}
                  <span
                    class="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-vlc-orange {reorderTarget.position ===
                    'before'
                      ? '-top-1'
                      : '-bottom-1'}"
                    aria-hidden="true"
                  ></span>
                {/if}
              </div>
            {/each}
          </div>
        {:else if $playlistsViewMode === 'list'}
          <div>
            {#if visibleTracks.some((track) => !mediaItemForTrack(track))}
              <div
                class="grid grid-cols-[24px_1fr_80px] items-center gap-3 border-b border-vlc-border px-4 py-2 text-[11px] uppercase tracking-wide text-vlc-muted sm:px-6"
                aria-hidden="true"
              >
                <span></span>
                <div class="grid grid-cols-[32px_1fr_120px_100px] items-center gap-3">
                  <span>#</span>
                  <span>Title</span>
                  <span class="text-right">Artist</span>
                  <span class="text-right">Duration</span>
                </div>
                <span></span>
              </div>
            {/if}
            {#each visibleTracks as track (track.id)}
              {@const i = trackSourceIndex(track.id, track.src)}
              {@const videoItem = mediaItemForTrack(track)}
              {#if videoItem}
                <div
                  class="flex items-stretch {reorderDrag?.fromIndex === i ? 'opacity-50' : ''}"
                  role="group"
                  aria-label={track.title}
                  on:contextmenu={(event) => openMediaContextMenu(event, track.id)}
                  on:dragover={(event) => handleTrackDragOver(event, i)}
                  on:dragleave={handleTrackDragLeave}
                  on:drop={(event) => handleTrackDrop(event, i)}
                >
                  <div class="flex w-8 shrink-0 flex-col items-center justify-center gap-0.5">
                    <button
                      type="button"
                      draggable="true"
                      data-track-control
                      data-track-handle
                      data-track-id={track.id}
                      class="flex h-6 w-6 cursor-grab items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 active:cursor-grabbing"
                      title={`Drag ${track.title} to reorder`}
                      aria-label={`Drag ${track.title} to reorder`}
                      on:dragstart={(event) => beginTrackReorder(event, i)}
                      on:dragend={endTrackReorder}
                    >
                      <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-track-control
                      data-track-id={track.id}
                      data-move-delta={-1}
                      class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30"
                      title={`Move ${track.title} up`}
                      aria-label={`Move ${track.title} up`}
                      disabled={i === 0}
                      on:click={() => moveTrackBy(i, -1)}
                    >
                      <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-track-control
                      data-track-id={track.id}
                      data-move-delta={1}
                      class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30"
                      title={`Move ${track.title} down`}
                      aria-label={`Move ${track.title} down`}
                      disabled={i === activePlaylist.tracks.length - 1}
                      on:click={() => moveTrackBy(i, 1)}
                    >
                      <ArrowDown size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                  <div class="min-w-0 flex-1">
                    <MediaListRow
                      item={videoItem}
                      mode="list"
                      selected={$currentTrack?.id === videoItem.id}
                      onSelect={() => playPlaylistTrack(i)}
                      on:info={(event) => openDetails(event.detail)}
                    />
                  </div>
                </div>
              {:else}
              <div
                class="relative grid grid-cols-[24px_1fr_80px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-6 py-2 text-[13px] text-vlc-secondary hover:bg-vlc-raised {reorderDrag?.fromIndex ===
                i
                  ? 'opacity-50'
                  : ''}"
                role="group"
                aria-label={track.title}
                on:contextmenu={(event) => openMediaContextMenu(event, track.id)}
                on:dragover={(event) => handleTrackDragOver(event, i)}
                on:dragleave={handleTrackDragLeave}
                on:drop={(event) => handleTrackDrop(event, i)}
              >
                <button
                  type="button"
                  draggable="true"
                  data-track-control
                  data-track-handle
                  data-track-id={track.id}
                  class="flex h-6 w-6 cursor-grab items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 active:cursor-grabbing"
                  title={`Drag ${track.title} to reorder`}
                  aria-label={`Drag ${track.title} to reorder`}
                  on:dragstart={(event) => beginTrackReorder(event, i)}
                  on:dragend={endTrackReorder}
                >
                  <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  class="grid min-w-0 grid-cols-[32px_1fr_120px_100px] items-center gap-3 rounded-input text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                  title={`Play ${track.title}`}
                  on:click={() => playPlaylistTrack(i)}
                >
                  <span class="text-vlc-muted">{i + 1}</span>
                  <span class="truncate text-vlc-text" title={track.title}>{track.title}</span>
                  <span class="truncate" title={track.artist}>{track.artist}</span>
                  <span class="text-right text-vlc-muted">
                    {formatDuration(track.duration)}
                  </span>
                </button>

                <span class="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    data-track-control
                    data-track-id={track.id}
                    data-move-delta={-1}
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-vlc-muted"
                    title={`Move ${track.title} up`}
                    aria-label={`Move ${track.title} up`}
                    disabled={i === 0}
                    on:click={() => moveTrackBy(i, -1)}
                  >
                    <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-track-control
                    data-track-id={track.id}
                    data-move-delta={1}
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-vlc-muted"
                    title={`Move ${track.title} down`}
                    aria-label={`Move ${track.title} down`}
                    disabled={i === activePlaylist.tracks.length - 1}
                    on:click={() => moveTrackBy(i, 1)}
                  >
                    <ArrowDown size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </span>

                {#if reorderTarget?.index === i}
                  <span
                    class="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-vlc-orange {reorderTarget.position ===
                    'before'
                      ? '-top-px'
                      : '-bottom-px'}"
                    aria-hidden="true"
                  ></span>
                {/if}
              </div>
              {/if}
            {/each}
          </div>
        {:else}
          <div class="px-4 py-2 sm:px-6">
            {#each visibleTracks as track (track.id)}
              {@const i = trackSourceIndex(track.id, track.src)}
              {@const videoItem = mediaItemForTrack(track)}
              {#if videoItem}
                <div
                  class="flex items-center {reorderDrag?.fromIndex === i ? 'opacity-50' : ''}"
                  role="group"
                  aria-label={track.title}
                  on:contextmenu={(event) => openMediaContextMenu(event, track.id)}
                  on:dragover={(event) => handleTrackDragOver(event, i)}
                  on:dragleave={handleTrackDragLeave}
                  on:drop={(event) => handleTrackDrop(event, i)}
                >
                  <div class="flex w-[4.5rem] shrink-0 items-center justify-center">
                    <button
                      type="button"
                      draggable="true"
                      data-track-control
                      data-track-handle
                      data-track-id={track.id}
                      class="flex h-6 w-6 cursor-grab items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 active:cursor-grabbing"
                      title={`Drag ${track.title} to reorder`}
                      aria-label={`Drag ${track.title} to reorder`}
                      on:dragstart={(event) => beginTrackReorder(event, i)}
                      on:dragend={endTrackReorder}
                    >
                      <GripVertical size={13} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-track-control
                      data-track-id={track.id}
                      data-move-delta={-1}
                      class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30"
                      title={`Move ${track.title} up`}
                      aria-label={`Move ${track.title} up`}
                      disabled={i === 0}
                      on:click={() => moveTrackBy(i, -1)}
                    >
                      <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-track-control
                      data-track-id={track.id}
                      data-move-delta={1}
                      class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30"
                      title={`Move ${track.title} down`}
                      aria-label={`Move ${track.title} down`}
                      disabled={i === activePlaylist.tracks.length - 1}
                      on:click={() => moveTrackBy(i, 1)}
                    >
                      <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                  <div class="min-w-0 flex-1">
                    <MediaListRow
                      item={videoItem}
                      mode="compact"
                      selected={$currentTrack?.id === videoItem.id}
                      onSelect={() => playPlaylistTrack(i)}
                      on:info={(event) => openDetails(event.detail)}
                    />
                  </div>
                </div>
              {:else}
              <div
                class="group relative flex h-8 w-full items-center gap-2 rounded-input border-b border-vlc-border/40 px-2 text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {reorderDrag?.fromIndex ===
                i
                  ? 'opacity-50'
                  : ''}"
                role="group"
                aria-label={track.title}
                on:contextmenu={(event) => openMediaContextMenu(event, track.id)}
                on:dragover={(event) => handleTrackDragOver(event, i)}
                on:dragleave={handleTrackDragLeave}
                on:drop={(event) => handleTrackDrop(event, i)}
              >
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-3 rounded-input text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                  title={`Play ${track.title}`}
                  on:click={() => playPlaylistTrack(i)}
                >
                  <span class="w-6 shrink-0 text-right text-[11px] text-vlc-muted">{i + 1}</span>
                  <span class="min-w-0 flex-1 truncate text-vlc-text" title={track.title}
                    >{track.title}</span
                  >
                  <span
                    class="hidden w-40 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block"
                    title={track.artist}
                  >
                    {track.artist}
                  </span>
                  <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">
                    {formatDuration(track.duration)}
                  </span>
                </button>

                <span class="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    draggable="true"
                    data-track-control
                    data-track-handle
                    data-track-id={track.id}
                    class="flex h-6 w-6 cursor-grab items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 active:cursor-grabbing"
                    title={`Drag ${track.title} to reorder`}
                    aria-label={`Drag ${track.title} to reorder`}
                    on:dragstart={(event) => beginTrackReorder(event, i)}
                    on:dragend={endTrackReorder}
                  >
                    <GripVertical size={13} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-track-control
                    data-track-id={track.id}
                    data-move-delta={-1}
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-vlc-muted"
                    title={`Move ${track.title} up`}
                    aria-label={`Move ${track.title} up`}
                    disabled={i === 0}
                    on:click={() => moveTrackBy(i, -1)}
                  >
                    <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-track-control
                    data-track-id={track.id}
                    data-move-delta={1}
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-vlc-muted"
                    title={`Move ${track.title} down`}
                    aria-label={`Move ${track.title} down`}
                    disabled={i === activePlaylist.tracks.length - 1}
                    on:click={() => moveTrackBy(i, 1)}
                  >
                    <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </span>

                {#if reorderTarget?.index === i}
                  <span
                    class="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-vlc-orange {reorderTarget.position ===
                    'before'
                      ? '-top-px'
                      : '-bottom-px'}"
                    aria-hidden="true"
                  ></span>
                {/if}
              </div>
              {/if}
            {/each}
          </div>
        {/if}
    {:else if $playlistsData.length === 0}
      <div
        class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center"
      >
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
        >
          <ListMusic size={22} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-vlc-secondary">No playlists yet</p>
        <p class="mt-1 max-w-xs text-xs text-vlc-muted">
          Create a playlist, then add tracks from your library.
        </p>
        <div class="mt-4">
          <button
            type="button"
            class="rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text {focusRing}"
            on:click={openCreateDialog}
          >
            Create playlist
          </button>
        </div>
      </div>
    {:else if sortedPlaylists.length === 0}
      <div
        class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center"
      >
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
        >
          <ListMusic size={22} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-vlc-secondary">No playlists match “{query}”</p>
        <p class="mt-1 text-xs text-vlc-muted">Try a different name or clear the search.</p>
        <div class="mt-4">
          <button
            type="button"
            class="rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text {focusRing}"
            on:click={clearSearch}
          >
            Clear search
          </button>
        </div>
      </div>
    {:else}
      <div class="px-4 py-5 sm:px-6">
        {#if $playlistsViewMode === 'list'}
          <div
            class="mb-2 flex items-center gap-3 border-b border-vlc-border px-3 pb-2 text-[11px] uppercase tracking-wide text-vlc-muted"
            aria-hidden="true"
          >
            <span class="min-w-0 flex-1">Name</span>
            <span class="w-24 shrink-0 text-right">Tracks</span>
            <span class="w-20 shrink-0 text-right">Duration</span>
            <span class="w-8 shrink-0"></span>
          </div>
        {/if}

        {#each sections as section (section.id)}
          {#if section.items.length > 0}
            <section class="mb-8 last:mb-0" aria-label={section.label}>
              {#if section.id === 'pinned' || sections.length > 1}
                <p class="mb-3 text-[11px] font-medium uppercase tracking-wide text-vlc-muted">
                  {section.label}
                </p>
              {/if}

              {#if $playlistsViewMode === 'grid'}
                <div
                  class="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                >
                  {#each section.items as pl (pl.id)}
                    {@const isPinned = pinnedIds.includes(pl.id)}
                    <div
                      class="group relative min-w-0 rounded-control {dropTargetId === pl.id
                        ? 'ring-2 ring-vlc-orange ring-offset-2 ring-offset-vlc-app'
                        : ''}"
                      role="group"
                      on:dragover={(event) => handlePlaylistDragOver(event, pl.id)}
                      on:dragleave={(event) => handlePlaylistDragLeave(event, pl.id)}
                      on:drop={(event) => handlePlaylistDrop(event, pl.id)}
                    >
                      <button
                        type="button"
                        class="block w-full rounded-control text-left {focusRing}"
                        title={`Open ${pl.name}`}
                        aria-label={`Open ${pl.name}`}
                        on:click={() => openPlaylist(pl.id)}
                      >
                        <div
                          class="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-vlc-border bg-vlc-card text-vlc-muted transition group-hover:border-vlc-borderStrong group-hover:bg-vlc-raised"
                        >
                          <ListMusic size={30} strokeWidth={1.5} aria-hidden="true" />
                        </div>
                        {#if renamingId !== pl.id}
                          <div
                            class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text"
                            title={pl.name}
                          >
                            {pl.name}
                          </div>
                          <div class="truncate text-[11px] text-vlc-muted">
                            {playlistTrackLabel(pl.trackCount)} • {formatDuration(pl.totalDurationSeconds)}
                          </div>
                        {/if}
                      </button>
                      {#if renamingId === pl.id}
                        <div class="mt-2.5">
                          <PlaylistRenameField
                            bind:value={renameValue}
                            error={renameError}
                            label={`Rename ${pl.name}`}
                            on:commit={commitRename}
                            on:cancel={cancelRename}
                            on:input={() => (renameError = '')}
                          />
                        </div>
                        <div class="truncate text-[11px] text-vlc-muted">
                          {playlistTrackLabel(pl.trackCount)} • {formatDuration(pl.totalDurationSeconds)}
                        </div>
                      {/if}
                      {#if renamingId !== pl.id}
                        <button
                          type="button"
                          class="absolute right-10 top-2 flex h-7 w-7 items-center justify-center rounded-input bg-vlc-panel/90 text-vlc-muted opacity-0 transition-opacity hover:bg-vlc-raised hover:text-vlc-text group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 {focusRing}"
                          title={`Rename ${pl.name}`}
                          aria-label={`Rename ${pl.name}`}
                          on:click={() => startRename(pl.id, pl.name)}
                        >
                          <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-input bg-vlc-panel/90 transition-opacity hover:bg-vlc-raised hover:text-vlc-text {focusRing} {isPinned
                          ? 'text-vlc-orangeText opacity-100'
                          : 'text-vlc-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'}"
                        title={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                        aria-label={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                        aria-pressed={isPinned}
                        data-pin-id={pl.id}
                        on:click={() => togglePin(pl.id)}
                      >
                        {#if isPinned}
                          <PinOff size={14} strokeWidth={1.75} aria-hidden="true" />
                        {:else}
                          <Pin size={14} strokeWidth={1.75} aria-hidden="true" />
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              {:else if $playlistsViewMode === 'list'}
                <div>
                  {#each section.items as pl (pl.id)}
                    {@const isPinned = pinnedIds.includes(pl.id)}
                    <div
                      class="group flex items-center rounded-control transition-colors hover:bg-vlc-raised {dropTargetId === pl.id
                        ? 'ring-2 ring-inset ring-vlc-orange'
                        : ''}"
                      role="group"
                      on:dragover={(event) => handlePlaylistDragOver(event, pl.id)}
                      on:dragleave={(event) => handlePlaylistDragLeave(event, pl.id)}
                      on:drop={(event) => handlePlaylistDrop(event, pl.id)}
                    >
                      {#if renamingId === pl.id}
                        <div class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                          <span
                            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vlc-border bg-vlc-card text-vlc-muted"
                            aria-hidden="true"
                          >
                            <ListMusic size={16} strokeWidth={1.75} />
                          </span>
                          <PlaylistRenameField
                            bind:value={renameValue}
                            error={renameError}
                            label={`Rename ${pl.name}`}
                            on:commit={commitRename}
                            on:cancel={cancelRename}
                            on:input={() => (renameError = '')}
                          />
                        </div>
                      {:else}
                        <button
                          type="button"
                          class="flex min-w-0 flex-1 items-center gap-3 rounded-control px-3 py-2 text-left {focusRing}"
                          title={`Open ${pl.name}`}
                          aria-label={`Open ${pl.name}`}
                          on:click={() => openPlaylist(pl.id)}
                        >
                          <span
                            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vlc-border bg-vlc-card text-vlc-muted"
                            aria-hidden="true"
                          >
                            <ListMusic size={16} strokeWidth={1.75} />
                          </span>
                          <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text" title={pl.name}
                            >{pl.name}</span
                          >
                          <span class="w-24 shrink-0 text-right text-xs text-vlc-secondary">
                            {playlistTrackLabel(pl.trackCount)}
                          </span>
                          <span class="w-20 shrink-0 text-right text-xs text-vlc-muted">
                            {formatDuration(pl.totalDurationSeconds)}
                          </span>
                        </button>
                        <button
                          type="button"
                          class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-input text-vlc-muted opacity-0 transition-opacity hover:bg-vlc-card hover:text-vlc-text group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 {focusRing}"
                          title={`Rename ${pl.name}`}
                          aria-label={`Rename ${pl.name}`}
                          on:click={() => startRename(pl.id, pl.name)}
                        >
                          <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-input transition-opacity hover:bg-vlc-card hover:text-vlc-text {focusRing} {isPinned
                          ? 'text-vlc-orangeText opacity-100'
                          : 'text-vlc-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'}"
                        title={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                        aria-label={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                        aria-pressed={isPinned}
                        data-pin-id={pl.id}
                        on:click={() => togglePin(pl.id)}
                      >
                        {#if isPinned}
                          <PinOff size={14} strokeWidth={1.75} aria-hidden="true" />
                        {:else}
                          <Pin size={14} strokeWidth={1.75} aria-hidden="true" />
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <div>
                  {#each section.items as pl (pl.id)}
                    {@const isPinned = pinnedIds.includes(pl.id)}
                    <div
                      class="group flex items-center rounded-input border-b border-vlc-border/40 transition-colors last:border-b-0 hover:bg-vlc-raised {renamingId === pl.id
                        ? 'min-h-8 py-1'
                        : 'h-8'} {dropTargetId === pl.id ? 'ring-2 ring-inset ring-vlc-orange' : ''}"
                      role="group"
                      on:dragover={(event) => handlePlaylistDragOver(event, pl.id)}
                      on:dragleave={(event) => handlePlaylistDragLeave(event, pl.id)}
                      on:drop={(event) => handlePlaylistDrop(event, pl.id)}
                    >
                      {#if renamingId === pl.id}
                        <div class="min-w-0 flex-1 px-2">
                          <PlaylistRenameField
                            bind:value={renameValue}
                            error={renameError}
                            label={`Rename ${pl.name}`}
                            on:commit={commitRename}
                            on:cancel={cancelRename}
                            on:input={() => (renameError = '')}
                          />
                        </div>
                      {:else}
                        <button
                          type="button"
                          class="flex h-full min-w-0 flex-1 items-center gap-3 rounded-input px-2 text-left text-xs {focusRing}"
                          title={`Open ${pl.name}`}
                          aria-label={`Open ${pl.name}`}
                          on:click={() => openPlaylist(pl.id)}
                        >
                          <span class="min-w-0 flex-1 truncate text-vlc-text" title={pl.name}
                            >{pl.name}</span
                          >
                          <span class="w-20 shrink-0 text-right text-[11px] text-vlc-muted">
                            {playlistTrackLabel(pl.trackCount)}
                          </span>
                          <span class="w-14 shrink-0 text-right text-[11px] text-vlc-muted">
                            {formatDuration(pl.totalDurationSeconds)}
                          </span>
                        </button>
                        <button
                          type="button"
                          class="mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-input text-vlc-muted opacity-0 transition-opacity hover:bg-vlc-card hover:text-vlc-text group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 {focusRing}"
                          title={`Rename ${pl.name}`}
                          aria-label={`Rename ${pl.name}`}
                          on:click={() => startRename(pl.id, pl.name)}
                        >
                          <Pencil size={12} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-input transition-opacity hover:bg-vlc-card hover:text-vlc-text {focusRing} {isPinned
                          ? 'text-vlc-orangeText opacity-100'
                          : 'text-vlc-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'}"
                        title={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                        aria-label={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                        aria-pressed={isPinned}
                        data-pin-id={pl.id}
                        on:click={() => togglePin(pl.id)}
                      >
                        {#if isPinned}
                          <PinOff size={12} strokeWidth={1.75} aria-hidden="true" />
                        {:else}
                          <Pin size={12} strokeWidth={1.75} aria-hidden="true" />
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </section>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if feedback}
    <div
      class="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-control border border-vlc-borderStrong bg-vlc-panel px-3 py-2 text-[11px] text-vlc-text shadow-2xl"
      role="status"
      aria-live="polite"
    >
      {feedback}
    </div>
  {/if}

  <p class="sr-only" aria-live="polite">{announcement}</p>

  <CreatePlaylistDialog
    open={createOpen}
    returnFocusTo={createTrigger}
    on:close={() => (createOpen = false)}
    on:create={(event) => handleCreate(event.detail)}
  />
</div>
