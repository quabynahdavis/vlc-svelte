<script lang="ts">
  import { tick } from 'svelte';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ArrowUpDown,
    Check,
    GripVertical,
    ListMusic,
    Pin,
    PinOff,
    Plus,
  } from 'lucide-svelte';
  import { DEMO_MEDIA_SRC, type Playlist } from '../lib/mock';
  import {
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
</script>

<svelte:window on:click={handleWindowPointer} on:keydown={handleWindowKeydown} />

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
              <div class="group relative min-w-0">
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
                class="group flex h-9 items-center rounded-control transition-colors {selected === pl.id
                  ? 'bg-vlc-raised text-vlc-text'
                  : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
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
                class="group flex h-7 items-center rounded-input transition-colors {selected === pl.id
                  ? 'bg-vlc-raised text-vlc-text'
                  : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
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

      <div class="min-h-0 flex-1 overflow-y-auto">
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
              <button
                type="button"
                class="group block w-full rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
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
            {/each}
          </div>
        {:else if $playlistsViewMode === 'list'}
          <div class="border-t border-vlc-border">
            <div
              class="grid grid-cols-[36px_1fr_120px_100px_40px] items-center gap-3 px-6 py-2 text-[11px] uppercase text-vlc-muted"
            >
              #<span>Title</span><span class="text-right">Artist</span><span class="text-right"
                >Duration</span
              ><span></span>
            </div>
            {#each activePlaylist.tracks as track, i (track.id)}
              <div
                class="grid grid-cols-[36px_1fr_120px_100px_40px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-6 py-2 text-[13px] text-vlc-secondary hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                role="button"
                tabindex="0"
                aria-label={`Play ${track.title}`}
                on:click={() => playPlaylistTrack(i)}
                on:keydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    playPlaylistTrack(i);
                  }
                }}
              >
                <span class="text-vlc-muted">{i + 1}</span>
                <span class="truncate text-vlc-text">{track.title}</span>
                <span class="truncate">{track.artist}</span>
                <span class="text-right text-vlc-muted">{formatDuration(track.durationSeconds)}</span>
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                  aria-label={`More options for ${track.title}`}
                  on:click|stopPropagation={(e) =>
                    handleTrackContext(e, activePlaylist?.id ?? '', track.id)}
                  on:contextmenu={(e) => handleTrackContext(e, activePlaylist?.id ?? '', track.id)}
                >
                  <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="border-t border-vlc-border px-4 py-2 sm:px-6">
            {#each activePlaylist.tracks as track, i (track.id)}
              <button
                type="button"
                class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
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
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <CreatePlaylistDialog
    open={createOpen}
    returnFocusTo={createTrigger}
    on:close={() => (createOpen = false)}
    on:create={(event) => handleCreate(event.detail)}
  />
</div>
