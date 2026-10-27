<script lang="ts">
  import { tick } from 'svelte';
  import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Check, ChevronRight, Music2 } from 'lucide-svelte';
  import { artists, DEMO_MEDIA_SRC, type Album, type Artist } from '../lib/mock';
  import {
    musicBreadcrumb,
    selectedArtistId,
    selectedAlbumId,
    musicSort,
    musicSortDirection,
    type MusicSortKey,
    type SortDirection,
  } from '../stores/music';
  import { musicViewMode } from '../stores/viewModes';
  import { navigate } from '../stores/navigation';
  import { setQueue, type Track } from '../stores/player';
  import FuzzySearch from '../components/FuzzySearch.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';

  interface SortOption {
    key: MusicSortKey;
    label: string;
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  let localBreadcrumb = $musicBreadcrumb;
  $: localBreadcrumb = $musicBreadcrumb;

  let query = '';
  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
  }

  $: artist = $selectedArtistId ? artists.find(a => a.id === $selectedArtistId) : null;
  $: album = $selectedAlbumId && artist ? artist.albums.find(al => al.id === $selectedAlbumId) : null;

  $: isArtistView = !!$selectedArtistId && !$selectedAlbumId;
  $: isAlbumView = !!$selectedArtistId && !!$selectedAlbumId;

  $: filteredArtists = artists.filter(item => item.name.toLowerCase().includes(query));
  $: filteredAlbums = artist ? artist.albums.filter(al => !query || al.title.toLowerCase().includes(query) || al.year.toString().includes(query)) : [];
  $: filteredTracks = album ? album.tracks.filter(t => !query || t.title.toLowerCase().includes(query)) : [];

  /** Columns that make sense for the level currently on screen. */
  $: sortOptions = (isAlbumView
    ? [
        { key: 'title', label: 'Title' },
        { key: 'artist', label: 'Artist' },
        { key: 'duration', label: 'Duration' },
      ]
    : isArtistView
      ? [
          { key: 'title', label: 'Title' },
          { key: 'year', label: 'Year' },
          { key: 'duration', label: 'Duration' },
        ]
      : [
          { key: 'title', label: 'Name' },
          { key: 'album', label: 'Albums' },
          { key: 'duration', label: 'Duration' },
        ]) as SortOption[];

  $: activeSortKey = sortOptions.some((option) => option.key === $musicSort)
    ? $musicSort
    : sortOptions[0].key;
  $: activeSortLabel = sortOptions.find((option) => option.key === activeSortKey)?.label ?? 'Title';

  /**
   * Stable, direction-aware sort. Equal values keep their previous relative
   * order in both directions.
   */
  function sortStable<T>(
    items: T[],
    compare: (a: T, b: T) => number,
    direction: SortDirection,
  ): T[] {
    const sign = direction === 'asc' ? 1 : -1;

    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const result = compare(a.item, b.item);
        if (result === 0) return a.index - b.index;
        return result * sign;
      })
      .map(({ item }) => item);
  }

  function artistDuration(a: Artist): number {
    return a.albums.reduce((total, entry) => total + entry.durationSeconds, 0);
  }

  $: sortedArtists = sortStable(
    filteredArtists,
    (a, b) => {
      switch (activeSortKey) {
        case 'album':
          return a.albumCount - b.albumCount;
        case 'duration':
          return artistDuration(a) - artistDuration(b);
        default:
          return collator.compare(a.name, b.name);
      }
    },
    $musicSortDirection,
  );

  $: sortedAlbums = sortStable(
    filteredAlbums,
    (a, b) => {
      switch (activeSortKey) {
        case 'year':
          return a.year - b.year;
        case 'duration':
          return a.durationSeconds - b.durationSeconds;
        default:
          return collator.compare(a.title, b.title);
      }
    },
    $musicSortDirection,
  );

  $: sortedTracks = sortStable(
    filteredTracks,
    (a, b) => {
      switch (activeSortKey) {
        case 'artist':
          return collator.compare(artist?.name ?? '', artist?.name ?? '');
        case 'duration':
          return a.durationSeconds - b.durationSeconds;
        default:
          return collator.compare(a.title, b.title);
      }
    },
    $musicSortDirection,
  );

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

  function selectSortKey(key: MusicSortKey) {
    musicSort.set(key);
    closeSortMenu(true);
  }

  function toggleSortDirection() {
    musicSortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
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

    const items = Array.from(sortMenu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
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

  function goBack() {
    if ($selectedAlbumId) {
      selectedAlbumId.set(null);
      musicBreadcrumb.set([...$musicBreadcrumb].slice(0, -1));
    } else if ($selectedArtistId) {
      selectedArtistId.set(null);
      selectedAlbumId.set(null);
      musicBreadcrumb.set(['Videos', 'Music']);
    }
  }

  function selectArtist(a: Artist) {
    selectedArtistId.set(a.id);
    selectedAlbumId.set(null);
    musicBreadcrumb.set(['Videos', 'Music', a.name]);
  }

  function selectAlbum(al: Album) {
    if (!artist) return;
    selectedAlbumId.set(al.id);
    musicBreadcrumb.set(['Videos', 'Music', artist.name, al.title]);
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /** Play the visible album tracks through the shared demo clip. */
  function playTrack(index: number) {
    if (!album) return;

    const tracks: Track[] = sortedTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: artist?.name,
      duration: t.durationSeconds,
      src: DEMO_MEDIA_SRC,
    }));

    setQueue(tracks, index);
    navigate('home');
  }
</script>

<svelte:window on:click={handleWindowPointer} on:keydown={handleWindowKeydown} />

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title="Back"
      aria-label="Go back"
      on:click={goBack}
    >
      <ArrowLeft size={18} strokeWidth={1.75} />
    </button>

    <nav class="flex min-w-0 items-center gap-2 text-[13px] leading-none" aria-label="Breadcrumb">
      {#each localBreadcrumb as crumb, i}
        {#if i > 0}
          <ChevronRight size={14} strokeWidth={1.75} class="shrink-0 text-vlc-muted" aria-hidden="true" />
        {/if}
        <span class="min-w-0 truncate whitespace-nowrap" class:text-vlc-text={i === localBreadcrumb.length - 1} class:text-vlc-secondary={i !== localBreadcrumb.length - 1}>{crumb}</span>
      {/each}
    </nav>

    <div class="ml-auto flex shrink-0 items-center gap-2">
      <span class="mr-2 whitespace-nowrap text-xs text-vlc-muted" aria-live="polite">
        {isAlbumView ? filteredTracks.length : isArtistView ? filteredAlbums.length : filteredArtists.length} items
      </span>
      <div class="w-60">
        <FuzzySearch placeholder="Search…" on:search={handleSearch} />
      </div>
      <div class="relative" bind:this={sortRoot} on:focusout={handleSortFocusOut}>
        <button
          type="button"
          data-sort-trigger
          class="flex h-8 items-center gap-1.5 rounded-control px-2 text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
          title={`Sort: ${activeSortLabel} (${$musicSortDirection === 'asc' ? 'ascending' : 'descending'})`}
          aria-label={`Sort music, currently ${activeSortLabel}, ${$musicSortDirection === 'asc' ? 'ascending' : 'descending'}`}
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          aria-controls={sortOpen ? 'music-sort-menu' : undefined}
          on:click={toggleSortMenu}
        >
          <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
          <span class="whitespace-nowrap text-xs">{activeSortLabel}</span>
          {#if $musicSortDirection === 'asc'}
            <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
          {:else}
            <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
          {/if}
        </button>

        {#if sortOpen}
          <div
            id="music-sort-menu"
            bind:this={sortMenu}
            role="menu"
            tabindex="-1"
            aria-label="Sort music by"
            class="absolute right-0 top-full z-30 mt-1 w-44 rounded-control border border-vlc-borderStrong bg-vlc-panel p-1 shadow-2xl"
            on:keydown={handleSortMenuKeydown}
          >
            <p class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-vlc-muted">
              Sort by
            </p>

            {#each sortOptions as option (option.key)}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={activeSortKey === option.key}
                tabindex="-1"
                class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50 {activeSortKey === option.key
                  ? 'bg-vlc-raised text-vlc-text'
                  : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
                on:click={() => selectSortKey(option.key)}
              >
                <Check
                  size={13}
                  strokeWidth={2}
                  class={activeSortKey === option.key ? 'text-vlc-orangeText' : 'text-transparent'}
                  aria-hidden="true"
                />
                <span class="flex-1">{option.label}</span>
              </button>
            {/each}

            <div class="my-1 h-px bg-vlc-border" role="separator"></div>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={$musicSortDirection === 'desc'}
              tabindex="-1"
              class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
              title="Toggle sort direction"
              on:click={toggleSortDirection}
            >
              <Check
                size={13}
                strokeWidth={2}
                class={$musicSortDirection === 'desc' ? 'text-vlc-orangeText' : 'text-transparent'}
                aria-hidden="true"
              />
              <span class="flex-1">Descending</span>
              {#if $musicSortDirection === 'desc'}
                <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
              {:else}
                <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
              {/if}
            </button>
          </div>
        {/if}
      </div>
      <ViewModeToggle
        value={$musicViewMode}
        onChange={(mode) => musicViewMode.set(mode)}
        label="Music view mode"
      />
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if !isArtistView && !isAlbumView}
      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each sortedArtists as a (a.id)}
            <button
              type="button"
              class="group block w-full rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
              title={`Open ${a.name}`}
              on:click={() => selectArtist(a)}
            >
              <div class="relative aspect-square w-full overflow-hidden rounded-lg border border-vlc-border bg-vlc-card transition group-hover:border-vlc-borderStrong group-hover:bg-vlc-raised">
                <div class="flex h-full w-full items-center justify-center text-vlc-muted">🎤</div>
              </div>
              <div class="mt-2.5 truncate text-[11px] leading-4 text-vlc-text">{a.name}</div>
              <div class="text-[11px] text-vlc-muted">{a.albumCount} albums • {formatDuration(artistDuration(a))}</div>
            </button>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div class="px-4 py-4 sm:px-6">
          <div class="grid grid-cols-[minmax(0,1fr)_100px_100px] items-center gap-3 border-b border-vlc-border px-3 pb-2 text-[11px] uppercase tracking-wide text-vlc-muted">
            <span>Name</span>
            <span class="text-right">Albums</span>
            <span class="text-right">Duration</span>
          </div>
          <div class="mt-1">
            {#each sortedArtists as a (a.id)}
              <button
                type="button"
                class="grid w-full grid-cols-[minmax(0,1fr)_100px_100px] items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                title={`Open ${a.name}`}
                on:click={() => selectArtist(a)}
              >
                <span class="flex min-w-0 items-center gap-3">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vlc-border bg-vlc-card text-sm">🎤</span>
                  <span class="truncate text-[13px] text-vlc-text">{a.name}</span>
                </span>
                <span class="text-right text-xs text-vlc-secondary">{a.albumCount} albums</span>
                <span class="text-right text-xs text-vlc-muted">{formatDuration(artistDuration(a))}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="px-4 py-2 sm:px-6">
          {#each sortedArtists as a (a.id)}
            <button
              type="button"
              class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
              title={`Open ${a.name}`}
              on:click={() => selectArtist(a)}
            >
              <span class="min-w-0 flex-1 truncate text-vlc-text">{a.name}</span>
              <span class="shrink-0 text-[11px] text-vlc-muted">{a.albumCount} albums</span>
              <span class="w-14 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(artistDuration(a))}</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if isArtistView && artist}
      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each sortedAlbums as al (al.id)}
            <button
              type="button"
              class="group block w-full rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
              title={`Open ${al.title}`}
              on:click={() => selectAlbum(al)}
            >
              <div class="relative aspect-square w-full overflow-hidden rounded-lg border border-vlc-border bg-vlc-card transition group-hover:border-vlc-borderStrong group-hover:bg-vlc-raised">
                <div class="flex h-full w-full items-center justify-center text-vlc-muted">💿</div>
              </div>
              <div class="mt-2.5 truncate text-[11px] leading-4 text-vlc-text">{al.title}</div>
              <div class="text-[11px] text-vlc-muted">{al.year} • {al.trackCount} tracks</div>
            </button>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div class="px-4 py-4 sm:px-6">
          <div class="grid grid-cols-[minmax(0,1fr)_150px_70px_90px] items-center gap-3 border-b border-vlc-border px-3 pb-2 text-[11px] uppercase tracking-wide text-vlc-muted">
            <span>Title</span>
            <span>Artist</span>
            <span class="text-right">Year</span>
            <span class="text-right">Tracks</span>
          </div>
          <div class="mt-1">
            {#each sortedAlbums as al (al.id)}
              <button
                type="button"
                class="grid w-full grid-cols-[minmax(0,1fr)_150px_70px_90px] items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
                title={`Open ${al.title}`}
                on:click={() => selectAlbum(al)}
              >
                <span class="flex min-w-0 items-center gap-3">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vlc-border bg-vlc-card text-sm">💿</span>
                  <span class="truncate text-[13px] text-vlc-text">{al.title}</span>
                </span>
                <span class="truncate text-xs text-vlc-secondary">{artist?.name}</span>
                <span class="text-right text-xs text-vlc-muted">{al.year}</span>
                <span class="text-right text-xs text-vlc-muted">{al.trackCount} tracks</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="px-4 py-2 sm:px-6">
          {#each sortedAlbums as al (al.id)}
            <button
              type="button"
              class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
              title={`Open ${al.title}`}
              on:click={() => selectAlbum(al)}
            >
              <span class="min-w-0 flex-1 truncate text-vlc-text">{al.title}</span>
              <span class="hidden w-36 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block">{artist?.name}</span>
              <span class="w-10 shrink-0 text-right text-[11px] text-vlc-muted">{al.year}</span>
              <span class="w-16 shrink-0 text-right text-[11px] text-vlc-muted">{al.trackCount} tracks</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if isAlbumView && album}
      <div class="px-6 py-4">
        <div class="flex items-center gap-4">
          <div class="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-vlc-border bg-vlc-card text-3xl">💿</div>
          <div>
            <div class="text-[17px] font-medium text-vlc-text">{album.title}</div>
            <div class="text-[13px] text-vlc-secondary">{artist?.name} • {album.year} • {album.trackCount} tracks</div>
          </div>
        </div>
      </div>

      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 border-t border-vlc-border p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each sortedTracks as t, i (t.id)}
            <button
              type="button"
              class="group block w-full rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
              title={`Play ${t.title}`}
              on:click={() => playTrack(i)}
            >
              <div class="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-vlc-border bg-vlc-card text-vlc-muted transition group-hover:border-vlc-borderStrong group-hover:bg-vlc-raised">
                <Music2 size={30} strokeWidth={1.5} aria-hidden="true" />
                <span class="absolute bottom-2 right-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] text-vlc-secondary">{formatDuration(t.durationSeconds)}</span>
              </div>
              <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{t.title}</div>
              <div class="truncate text-[11px] text-vlc-muted">{artist?.name}</div>
            </button>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div class="border-t border-vlc-border">
          <div class="grid grid-cols-[36px_1fr_120px_90px] items-center gap-3 px-6 py-2 text-[11px] uppercase tracking-wide text-vlc-muted">
            <span>#</span><span>Title</span><span>Artist</span><span>Duration</span>
          </div>
          {#each sortedTracks as t, i (t.id)}
            <button
              type="button"
              class="grid w-full grid-cols-[36px_1fr_120px_90px] items-center gap-3 rounded-control px-6 py-2 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
              title={`Play ${t.title}`}
              on:click={() => playTrack(i)}
            >
              <span class="text-vlc-muted">{t.trackNumber}</span>
              <span class="truncate text-vlc-text">{t.title}</span>
              <span class="truncate">{artist?.name}</span>
              <span class="text-vlc-muted">{formatDuration(t.durationSeconds)}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="border-t border-vlc-border px-4 py-2 sm:px-6">
          {#each sortedTracks as t, i (t.id)}
            <button
              type="button"
              class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/70"
              title={`Play ${t.title}`}
              on:click={() => playTrack(i)}
            >
              <span class="w-6 shrink-0 text-right text-[11px] text-vlc-muted">{t.trackNumber}</span>
              <span class="min-w-0 flex-1 truncate text-vlc-text">{t.title}</span>
              <span class="hidden w-40 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block">{artist?.name}</span>
              <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(t.durationSeconds)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
