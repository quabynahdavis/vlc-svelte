<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ArrowUpDown,
    Check,
    Ellipsis,
    GripVertical,
    ListMusic,
    Pin,
    PinOff,
    Plus,
  } from 'lucide-svelte';
  import { isTrackDrag, readTrackDrag } from '../lib/dragTrack';
  import { DEMO_MEDIA_SRC, type Playlist } from '../lib/mock';
  import {
    addTrackToPlaylist,
    movePlaylistTrack,
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
  import { setQueue, type Track } from '../stores/player';
  import CreatePlaylistDialog from '../components/CreatePlaylistDialog.svelte';
  import FuzzySearch from '../components/FuzzySearch.svelte';
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

  $: filtered = $playlistsData.filter((item) => item.name.toLowerCase().includes(query));

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

  $: activeSortLabel =
    sortOptions.find((option) => option.key === $playlistsSort)?.label ?? 'Manual';
  $: directionLabel =
    $playlistsSort === 'manual'
      ? 'Manual order'
      : $playlistsSortDirection === 'asc'
        ? 'Ascending'
        : 'Descending';

  let sortOpen = false;
  let sortRoot: HTMLDivElement;
  let sortMenu: HTMLDivElement;

  async function toggleSortMenu() {
    sortOpen = !sortOpen;
    if (!sortOpen) return;

    await tick();
    sortMenu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  function closeSortMenu(refocus = false) {
    sortOpen = false;
    if (!refocus) return;

    requestAnimationFrame(() => {
      sortRoot?.querySelector<HTMLElement>('[data-sort-trigger]')?.focus();
    });
  }

  function selectSortKey(key: PlaylistsSortKey) {
    playlistsSort.set(key);
    closeSortMenu(true);
  }

  function toggleSortDirection() {
    if ($playlistsSort === 'manual') return;
    playlistsSortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    closeSortMenu(true);
  }

  function handleWindowPointer(event: MouseEvent) {
    if (!sortOpen) return;
    const target = event.target;
    if (target instanceof Node && sortRoot?.contains(target)) return;
    sortOpen = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!sortOpen || event.key !== 'Escape') return;
    event.preventDefault();
    closeSortMenu(true);
  }

  function handleSortMenuKeydown(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(
      sortMenu?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [],
    );
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = 0;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === 'End') nextIndex = items.length - 1;

    items[nextIndex]?.focus();
  }

  function handleSortFocusOut(event: FocusEvent) {
    if (!sortOpen) return;
    const next = event.relatedTarget;
    if (next instanceof Node && sortRoot?.contains(next)) return;
    sortOpen = false;
  }

  function formatDuration(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function openPlaylist(id: string) {
    playlistsSelectedId.set(id);
  }

  function closePlaylist() {
    playlistsSelectedId.set(null);
  }

  function handleTrackContext(e: MouseEvent, playlistId: string, trackId: string) {
    e.preventDefault();
  }

  /** Queue the open playlist through each track's source (demo clip for mock rows). */
  function playPlaylistTrack(index: number) {
    if (!activePlaylist) return;

    const tracks: Track[] = activePlaylist.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.durationSeconds,
      src: t.source ?? DEMO_MEDIA_SRC,
    }));

    setQueue(tracks, index);
    navigate('home');
  }

  let createOpen = false;
  let createTrigger: HTMLElement | null = null;

  function openCreateDialog(event: MouseEvent) {
    sortOpen = false;
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
    // Session-only: the tracks hold blob: URLs, which cannot survive a reload.
    playlistsData.update((items) => [playlist, ...items]);
    playlistsSelectedId.set(playlist.id);
    clearSearch();
    createOpen = false;
  }

  $: activePlaylist = $playlistsData.find((playlist) => playlist.id === selected) ?? null;

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

    event.dataTransfer.effectAllowed = 'move';
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
    if (!track || !playlist) return;

    const added = addTrackToPlaylist(playlistId, {
      id: track.id,
      title: track.title,
      artist: track.artist ?? '',
      durationSeconds: track.duration,
      source: track.src,
    });

    showFeedback(
      added
        ? `Added “${track.title}” to ${playlist.name}`
        : `“${track.title}” is already in ${playlist.name}`,
    );
  }

  function handlePlaylistDragOver(event: DragEvent, playlistId: string) {
    if (!isTrackDrag(event)) {
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
    if (!isTrackDrag(event)) return;

    event.preventDefault();
    event.stopPropagation();
    addDroppedTrack(event, playlistId);
  }

  function handleDetailDragOver(event: DragEvent) {
    if (!isTrackDrag(event)) {
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
    if (!activePlaylist || !isTrackDrag(event)) return;

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

<svelte:window
  on:click={handleWindowPointer}
  on:keydown={handleWindowKeydown}
  on:dragend={handleWindowDragEnd}
/>

<div class="flex h-full bg-vlc-app">
  <aside class="w-[200px] shrink-0 border-r border-vlc-border bg-vlc-panel flex flex-col">
    <header class="flex h-11 items-center gap-2 border-b border-vlc-border px-3">
      <button
        class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-raised"
        on:click={closePlaylist}
        aria-label="Back"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <h2 class="min-w-0 flex-1 truncate text-[13px] font-medium text-vlc-text">Playlists</h2>

      <div class="relative" bind:this={sortRoot} on:focusout={handleSortFocusOut}>
        <button
          type="button"
          data-sort-trigger
          class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
          title={`Sort playlists: ${activeSortLabel} (${directionLabel.toLowerCase()})`}
          aria-label={`Sort playlists, currently ${activeSortLabel}, ${directionLabel.toLowerCase()}`}
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          aria-controls={sortOpen ? 'playlists-sort-menu' : undefined}
          on:click={toggleSortMenu}
        >
          <ArrowUpDown size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>

        {#if sortOpen}
          <div
            id="playlists-sort-menu"
            bind:this={sortMenu}
            role="menu"
            tabindex="-1"
            aria-label="Sort playlists by"
            class="absolute left-0 top-full z-30 mt-1 w-44 rounded-control border border-vlc-borderStrong bg-vlc-panel p-1 shadow-2xl"
            on:keydown={handleSortMenuKeydown}
          >
            <p class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-vlc-muted">
              Sort by
            </p>

            {#each sortOptions as option (option.key)}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={$playlistsSort === option.key}
                tabindex="-1"
                class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50 {$playlistsSort === option.key
                  ? 'bg-vlc-raised text-vlc-text'
                  : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
                on:click={() => selectSortKey(option.key)}
              >
                <Check
                  size={13}
                  strokeWidth={2}
                  class={$playlistsSort === option.key ? 'text-vlc-orangeText' : 'text-transparent'}
                  aria-hidden="true"
                />
                <span class="flex-1">{option.label}</span>
              </button>
            {/each}

            <div class="my-1 h-px bg-vlc-border" role="separator"></div>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={$playlistsSortDirection === 'desc'}
              tabindex="-1"
              disabled={$playlistsSort === 'manual'}
              class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              title={$playlistsSort === 'manual'
                ? 'Choose a sort option to change direction'
                : 'Toggle sort direction'}
              on:click={toggleSortDirection}
            >
              <Check
                size={13}
                strokeWidth={2}
                class={$playlistsSortDirection === 'desc'
                  ? 'text-vlc-orangeText'
                  : 'text-transparent'}
                aria-hidden="true"
              />
              <span class="flex-1">Descending</span>
              {#if $playlistsSortDirection === 'desc'}
                <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
              {:else}
                <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
              {/if}
            </button>
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
        title="Create Playlist"
        aria-label="Create playlist"
        aria-haspopup="dialog"
        aria-expanded={createOpen}
        on:click={openCreateDialog}
      >
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-2 py-2">
      {#if $playlistsData.length === 0}
        <div class="flex flex-col items-center gap-3 px-3 py-10 text-center">
          <ListMusic size={24} strokeWidth={1.5} class="text-vlc-muted" aria-hidden="true" />
          <div>
            <p class="text-[13px] font-medium text-vlc-text">No playlists yet</p>
            <p class="mt-1 text-[11px] leading-4 text-vlc-muted">
              Create one to collect your media.
            </p>
          </div>
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-control bg-vlc-orange px-3 text-[11px] font-medium text-[var(--selection-ink)] transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
            on:click={openCreateDialog}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            Create playlist
          </button>
        </div>
      {:else if sortedPlaylists.length === 0}
        <p class="px-2 py-6 text-center text-[11px] leading-4 text-vlc-muted">
          No playlists match “{query}”.
        </p>
      {:else if $playlistsViewMode === 'grid'}
        {#each sections as section (section.id)}
          <p
            class="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-vlc-muted first:pt-0"
          >
            {section.label}
          </p>
          <div class="grid grid-cols-2 gap-1.5">
            {#each section.items as pl (pl.id)}
              {@const isPinned = pinnedIds.includes(pl.id)}
              <div
                class="group relative min-w-0 rounded-control transition-shadow {dropTargetId ===
                pl.id
                  ? 'ring-2 ring-vlc-orange ring-offset-2 ring-offset-vlc-panel'
                  : ''}"
                role="group"
                on:dragover={(event) => handlePlaylistDragOver(event, pl.id)}
                on:dragleave={(event) => handlePlaylistDragLeave(event, pl.id)}
                on:drop={(event) => handlePlaylistDrop(event, pl.id)}
              >
                <button
                  type="button"
                  class="flex w-full min-w-0 flex-col items-center gap-1 rounded-control border px-1.5 py-2 text-center text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 {selected ===
                  pl.id
                    ? 'border-vlc-borderStrong bg-vlc-raised text-vlc-text'
                    : 'border-transparent text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
                  title={pl.name}
                  aria-current={selected === pl.id ? 'true' : undefined}
                  on:click={() => openPlaylist(pl.id)}
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-md bg-vlc-card text-sm"
                    aria-hidden="true">📋</span
                  >
                  <span class="w-full truncate">{pl.name}</span>
                </button>
                <button
                  type="button"
                  class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-input bg-vlc-panel/90 transition-opacity hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 {isPinned
                    ? 'text-vlc-orangeText opacity-100'
                    : 'text-vlc-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'}"
                  title={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                  aria-label={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                  data-pin-id={pl.id}
                  aria-pressed={isPinned}
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
        {/each}
      {:else if $playlistsViewMode === 'list'}
        {#each sections as section (section.id)}
          <p
            class="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-vlc-muted first:pt-0"
          >
            {section.label}
          </p>
          <div class="space-y-0.5">
            {#each section.items as pl (pl.id)}
              {@const isPinned = pinnedIds.includes(pl.id)}
              <div
                class="group flex h-9 items-center rounded-control transition-colors {selected ===
                pl.id
                  ? 'bg-vlc-raised text-vlc-text'
                  : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'} {dropTargetId ===
                pl.id
                  ? 'ring-2 ring-inset ring-vlc-orange'
                  : ''}"
                role="group"
                on:dragover={(event) => handlePlaylistDragOver(event, pl.id)}
                on:dragleave={(event) => handlePlaylistDragLeave(event, pl.id)}
                on:drop={(event) => handlePlaylistDrop(event, pl.id)}
              >
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-3 rounded-control px-3 text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                  aria-current={selected === pl.id ? 'true' : undefined}
                  on:click={() => openPlaylist(pl.id)}
                >
                  <span class="shrink-0" aria-hidden="true">📋</span>
                  <span class="truncate">{pl.name}</span>
                </button>
                <button
                  type="button"
                  class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-input transition-opacity hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 {isPinned
                    ? 'text-vlc-orangeText opacity-100'
                    : 'text-vlc-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'}"
                  title={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                  aria-label={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                  data-pin-id={pl.id}
                  aria-pressed={isPinned}
                  on:click={() => togglePin(pl.id)}
                >
                  {#if isPinned}
                    <PinOff size={13} strokeWidth={1.75} aria-hidden="true" />
                  {:else}
                    <Pin size={13} strokeWidth={1.75} aria-hidden="true" />
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {/each}
      {:else}
        {#each sections as section (section.id)}
          <p
            class="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-vlc-muted first:pt-0"
          >
            {section.label}
          </p>
          <div class="space-y-px">
            {#each section.items as pl (pl.id)}
              {@const isPinned = pinnedIds.includes(pl.id)}
              <div
                class="group flex h-7 items-center rounded-input transition-colors {selected ===
                pl.id
                  ? 'bg-vlc-raised text-vlc-text'
                  : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'} {dropTargetId ===
                pl.id
                  ? 'ring-2 ring-inset ring-vlc-orange'
                  : ''}"
                role="group"
                on:dragover={(event) => handlePlaylistDragOver(event, pl.id)}
                on:dragleave={(event) => handlePlaylistDragLeave(event, pl.id)}
                on:drop={(event) => handlePlaylistDrop(event, pl.id)}
              >
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-input px-2 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                  title={pl.name}
                  aria-current={selected === pl.id ? 'true' : undefined}
                  on:click={() => openPlaylist(pl.id)}
                >
                  <span class="shrink-0 text-[11px]" aria-hidden="true">📋</span>
                  <span class="truncate">{pl.name}</span>
                </button>
                <button
                  type="button"
                  class="mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-input transition-opacity hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70 {isPinned
                    ? 'text-vlc-orangeText opacity-100'
                    : 'text-vlc-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'}"
                  title={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                  aria-label={isPinned ? `Unpin ${pl.name}` : `Pin ${pl.name}`}
                  data-pin-id={pl.id}
                  aria-pressed={isPinned}
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
        {/each}
      {/if}
    </div>
  </aside>

  <div class="flex min-w-0 flex-1 flex-col">
    {#if !activePlaylist}
      <div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <ListMusic size={28} strokeWidth={1.5} class="text-vlc-muted" aria-hidden="true" />
        <p class="text-[13px] text-vlc-secondary">Select a playlist or create a new one</p>
      </div>
    {:else}
      <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
        <button
          class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-raised"
          on:click={closePlaylist}
          aria-label="Close playlist"
        >
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <nav class="flex min-w-0 items-center gap-2 text-[13px]">
          <span class="text-vlc-secondary">Playlists</span>
          <span class="text-vlc-muted">/</span>
          <span class="truncate text-vlc-text">{activePlaylist.name}</span>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <div class="w-56">
            {#key searchKey}
              <FuzzySearch placeholder="Search…" on:search={handleSearch} />
            {/key}
          </div>
          <ViewModeToggle
            value={$playlistsViewMode}
            onChange={(mode) => playlistsViewMode.set(mode)}
            label="Playlist view mode"
          />
        </div>
      </header>

      <div
        class="min-h-0 flex-1 overflow-y-auto"
        role="region"
        aria-label={`${activePlaylist.name} tracks`}
        on:dragover={handleDetailDragOver}
        on:dragleave={handleDetailDragLeave}
        on:drop={handleDetailDrop}
      >
        {#if detailDragActive}
          <div
            class="pointer-events-none sticky top-0 z-10 mx-4 mt-2 flex items-center justify-center gap-1.5 rounded-control border border-dashed border-vlc-orange/60 bg-vlc-panel/95 px-2 py-2 text-[11px] text-vlc-orangeText shadow-sm sm:mx-6"
            role="status"
          >
            <ListMusic size={13} strokeWidth={2} aria-hidden="true" />
            Drop to add to {activePlaylist.name}
          </div>
        {/if}

        {#if activePlaylist.tracks.length === 0}
          <div class="flex min-h-[240px] flex-col items-center justify-center gap-2 p-8 text-center">
            <ListMusic size={30} strokeWidth={1.5} class="text-vlc-muted" aria-hidden="true" />
            <p class="text-[14px] font-medium text-vlc-text">This playlist is empty</p>
            <p class="max-w-xs text-[12px] leading-5 text-vlc-muted">
              There are no tracks in this playlist yet.
            </p>
          </div>
        {:else if $playlistsViewMode === 'grid'}
          <div
            class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {#each activePlaylist.tracks as track, i (track.id)}
              <div
                class="group relative rounded-control {reorderDrag?.fromIndex === i ? 'opacity-50' : ''}"
                role="group"
                aria-label={track.title}
                on:dragover={(event) => handleTrackDragOver(event, i)}
                on:dragleave={handleTrackDragLeave}
                on:drop={(event) => handleTrackDrop(event, i)}
              >
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
                      class="absolute bottom-2 right-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] text-vlc-secondary"
                    >
                      {formatDuration(track.durationSeconds)}
                    </span>
                  </div>
                  <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">
                    {track.title}
                  </div>
                  <div class="truncate text-[11px] text-vlc-muted">{track.artist}</div>
                </button>

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
          <div class="border-t border-vlc-border">
            <div
              class="grid grid-cols-[24px_1fr_80px] items-center gap-3 px-6 py-2 text-[11px] uppercase text-vlc-muted"
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
            {#each activePlaylist.tracks as track, i (track.id)}
              <div
                class="relative grid grid-cols-[24px_1fr_80px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-6 py-2 text-[13px] text-vlc-secondary hover:bg-vlc-raised {reorderDrag?.fromIndex ===
                i
                  ? 'opacity-50'
                  : ''}"
                role="group"
                aria-label={track.title}
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
                  <span class="truncate text-vlc-text">{track.title}</span>
                  <span class="truncate">{track.artist}</span>
                  <span class="text-right text-vlc-muted">
                    {formatDuration(track.durationSeconds)}
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
                  <button
                    type="button"
                    class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                    aria-label={`More options for ${track.title}`}
                    on:click={(e) =>
                      handleTrackContext(e, activePlaylist?.id ?? '', track.id)}
                    on:contextmenu={(e) => handleTrackContext(e, activePlaylist?.id ?? '', track.id)}
                  >
                    <Ellipsis size={14} strokeWidth={1.75} aria-hidden="true" />
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
            {/each}
          </div>
        {:else}
          <div class="border-t border-vlc-border px-4 py-2 sm:px-6">
            {#each activePlaylist.tracks as track, i (track.id)}
              <div
                class="group relative flex h-8 w-full items-center gap-2 rounded-input border-b border-vlc-border/40 px-2 text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {reorderDrag?.fromIndex ===
                i
                  ? 'opacity-50'
                  : ''}"
                role="group"
                aria-label={track.title}
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
                  <span class="min-w-0 flex-1 truncate text-vlc-text">{track.title}</span>
                  <span
                    class="hidden w-40 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block"
                  >
                    {track.artist}
                  </span>
                  <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">
                    {formatDuration(track.durationSeconds)}
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
            {/each}
          </div>
        {/if}
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
