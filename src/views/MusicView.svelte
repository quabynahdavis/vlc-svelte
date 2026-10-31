<script lang="ts">
  import { tick } from 'svelte';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ArrowUpDown,
    Check,
    ChevronRight,
    ListMusic,
    ListPlus,
    Music2,
  } from 'lucide-svelte';
  import {
    artists,
    DEMO_MEDIA_SRC,
    type Album,
    type Artist,
    type Track as MusicTrack,
  } from '../lib/mock';
  import {
    musicBreadcrumb,
    musicBrowseMode,
    musicSort,
    musicSortDirection,
    selectedAlbumId,
    selectedArtistId,
    selectedGenre,
    type MusicBrowseMode,
    type MusicSortKey,
    type SortDirection,
  } from '../stores/music';
  import { musicViewMode } from '../stores/viewModes';
  import { navigate } from '../stores/navigation';
  import { startTrackDrag } from '../lib/dragTrack';
  import { libraryImportLog } from '../stores/library';
  import { addToQueue, setQueue, type Track as QueueTrack } from '../stores/player';
  import { openPlaylistTarget } from '../stores/playlistTarget';
  import FuzzySearch from '../components/FuzzySearch.svelte';
  import MusicCover from '../components/MusicCover.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';

  type BrowseLevel = 'songs' | 'albums' | 'artists' | 'genres' | 'artist' | 'album' | 'genre';

  interface SortOption {
    key: MusicSortKey;
    label: string;
  }

  interface AlbumEntry {
    album: Album;
    artist: Artist;
  }

  interface TrackEntry {
    track: MusicTrack;
    album: Album;
    artist: Artist;
  }

  interface GenreEntry {
    name: string;
    trackCount: number;
    albumCount: number;
    durationSeconds: number;
    tracks: TrackEntry[];
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app';

  const browseModes: Array<{ id: MusicBrowseMode; label: string }> = [
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
    { id: 'genres', label: 'Genres' },
  ];

  const artistById = new Map(artists.map((artist) => [artist.id, artist]));
  const allAlbums: AlbumEntry[] = artists.flatMap((artist) =>
    artist.albums.map((album) => ({ album, artist })),
  );
  const allTracks: TrackEntry[] = allAlbums.flatMap(({ album, artist }) =>
    album.tracks.map((track) => ({ track, album, artist })),
  );

  const waveformBars = Array.from({ length: 72 }, (_, index) => {
    const wave = Math.abs(Math.sin((index + 1) * 0.52) * Math.cos((index + 1) * 0.19));
    return 16 + Math.round(wave * 72);
  });

  let query = '';
  let searchKey = 0;

  function handleSearch(event: CustomEvent<string>) {
    query = event.detail;
  }

  function clearSearch() {
    query = '';
    searchKey += 1;
  }

  function matches(values: Array<string | number>): boolean {
    if (!query) return true;
    return values.some((value) => String(value).toLowerCase().includes(query));
  }

  function albumGenre(album: Album): string {
    return album.tracks[0]?.genre ?? 'Unknown';
  }

  function artistDuration(artist: Artist): number {
    return artist.albums.reduce((total, album) => total + album.durationSeconds, 0);
  }

  function artistAlbumEntries(artist: Artist): AlbumEntry[] {
    return artist.albums.map((album) => ({ album, artist }));
  }

  function albumTrackEntries(entry: AlbumEntry): TrackEntry[] {
    return entry.album.tracks.map((track) => ({
      track,
      album: entry.album,
      artist: entry.artist,
    }));
  }

  function buildGenres(entries: TrackEntry[]): GenreEntry[] {
    const buckets = new Map<string, { entry: GenreEntry; albumIds: Set<string> }>();

    for (const item of entries) {
      const name = item.track.genre || 'Unknown';
      let bucket = buckets.get(name);
      if (!bucket) {
        bucket = {
          entry: { name, trackCount: 0, albumCount: 0, durationSeconds: 0, tracks: [] },
          albumIds: new Set<string>(),
        };
        buckets.set(name, bucket);
      }

      bucket.entry.trackCount += 1;
      bucket.entry.durationSeconds += item.track.durationSeconds;
      bucket.entry.tracks.push(item);
      bucket.albumIds.add(item.album.id);
    }

    return Array.from(buckets.values(), ({ entry, albumIds }) => ({
      ...entry,
      albumCount: albumIds.size,
    }));
  }

  const genreEntries = buildGenres(allTracks);

  function resolveLevel(
    mode: MusicBrowseMode,
    artist: Artist | null,
    albumEntry: AlbumEntry | null,
    genreName: string | null,
  ): BrowseLevel {
    if (mode === 'artists') {
      if (albumEntry) return 'album';
      if (artist) return 'artist';
      return 'artists';
    }
    if (mode === 'albums') return albumEntry ? 'album' : 'albums';
    if (mode === 'genres') return genreName ? 'genre' : 'genres';
    return 'songs';
  }

  function getSortOptions(level: BrowseLevel): SortOption[] {
    switch (level) {
      case 'songs':
      case 'genre':
        return [
          { key: 'title', label: 'Title' },
          { key: 'artist', label: 'Artist' },
          { key: 'album', label: 'Album' },
          { key: 'year', label: 'Year' },
          { key: 'duration', label: 'Duration' },
        ];
      case 'album':
        return [
          { key: 'title', label: 'Title' },
          { key: 'artist', label: 'Artist' },
          { key: 'duration', label: 'Duration' },
        ];
      case 'artist':
        return [
          { key: 'title', label: 'Title' },
          { key: 'year', label: 'Year' },
          { key: 'duration', label: 'Duration' },
        ];
      case 'albums':
        return [
          { key: 'title', label: 'Title' },
          { key: 'artist', label: 'Artist' },
          { key: 'year', label: 'Year' },
          { key: 'duration', label: 'Duration' },
        ];
      case 'artists':
        return [
          { key: 'title', label: 'Name' },
          { key: 'album', label: 'Albums' },
          { key: 'duration', label: 'Duration' },
        ];
      case 'genres':
        return [
          { key: 'title', label: 'Genre' },
          { key: 'album', label: 'Songs' },
          { key: 'duration', label: 'Duration' },
        ];
    }
  }

  function compareArtists(a: Artist, b: Artist, key: MusicSortKey): number {
    switch (key) {
      case 'album':
        return a.albumCount - b.albumCount;
      case 'duration':
        return artistDuration(a) - artistDuration(b);
      default:
        return collator.compare(a.name, b.name);
    }
  }

  function compareAlbums(a: AlbumEntry, b: AlbumEntry, key: MusicSortKey): number {
    switch (key) {
      case 'artist':
        return (
          collator.compare(a.artist.name, b.artist.name) ||
          collator.compare(a.album.title, b.album.title)
        );
      case 'year':
        return a.album.year - b.album.year;
      case 'duration':
        return a.album.durationSeconds - b.album.durationSeconds;
      default:
        return collator.compare(a.album.title, b.album.title);
    }
  }

  function compareTracks(a: TrackEntry, b: TrackEntry, key: MusicSortKey): number {
    switch (key) {
      case 'artist':
        return (
          collator.compare(a.artist.name, b.artist.name) ||
          collator.compare(a.track.title, b.track.title)
        );
      case 'album':
        return (
          collator.compare(a.album.title, b.album.title) ||
          a.track.trackNumber - b.track.trackNumber
        );
      case 'year':
        return a.album.year - b.album.year;
      case 'duration':
        return a.track.durationSeconds - b.track.durationSeconds;
      default:
        return collator.compare(a.track.title, b.track.title);
    }
  }

  function compareGenres(a: GenreEntry, b: GenreEntry, key: MusicSortKey): number {
    switch (key) {
      case 'album':
        return a.trackCount - b.trackCount;
      case 'duration':
        return a.durationSeconds - b.durationSeconds;
      default:
        return collator.compare(a.name, b.name);
    }
  }

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

  $: selectedArtist = $selectedArtistId ? artistById.get($selectedArtistId) ?? null : null;
  $: selectedAlbum = $selectedAlbumId
    ? allAlbums.find(({ album }) => album.id === $selectedAlbumId) ?? null
    : null;
  $: selectedGenreEntry = $selectedGenre
    ? genreEntries.find((genre) => genre.name === $selectedGenre) ?? null
    : null;

  $: level = resolveLevel($musicBrowseMode, selectedArtist, selectedAlbum, $selectedGenre);

  $: filteredArtists = artists.filter((artist) => matches([artist.name]));
  $: filteredAllAlbums = allAlbums.filter(({ album, artist }) =>
    matches([album.title, artist.name, album.year, albumGenre(album)]),
  );
  $: filteredArtistAlbums = selectedArtist
    ? artistAlbumEntries(selectedArtist).filter(({ album }) =>
        matches([album.title, album.year, albumGenre(album)]),
      )
    : [];
  $: filteredSongs = allTracks.filter(({ track, album, artist }) =>
    matches([track.title, artist.name, album.title, track.genre, album.year]),
  );
  $: filteredGenres = genreEntries.filter((genre) => matches([genre.name]));
  $: filteredAlbumTracks = selectedAlbum
    ? albumTrackEntries(selectedAlbum).filter(({ track }) =>
        matches([track.title, track.genre]),
      )
    : [];
  $: filteredGenreTracks = selectedGenreEntry
    ? selectedGenreEntry.tracks.filter(({ track, album, artist }) =>
        matches([track.title, artist.name, album.title, track.genre, album.year]),
      )
    : [];

  $: sortOptions = getSortOptions(level);
  $: activeSortKey = sortOptions.some((option) => option.key === $musicSort)
    ? $musicSort
    : sortOptions[0].key;
  $: activeSortLabel = sortOptions.find((option) => option.key === activeSortKey)?.label ?? 'Title';

  $: sortedArtists = sortStable(
    filteredArtists,
    (a, b) => compareArtists(a, b, activeSortKey),
    $musicSortDirection,
  );
  $: sortedAllAlbums = sortStable(
    filteredAllAlbums,
    (a, b) => compareAlbums(a, b, activeSortKey),
    $musicSortDirection,
  );
  $: sortedArtistAlbums = sortStable(
    filteredArtistAlbums,
    (a, b) => compareAlbums(a, b, activeSortKey),
    $musicSortDirection,
  );
  $: sortedSongs = sortStable(
    filteredSongs,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );
  $: sortedAlbumTracks = sortStable(
    filteredAlbumTracks,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );
  $: sortedGenreTracks = sortStable(
    filteredGenreTracks,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );
  $: sortedGenres = sortStable(
    filteredGenres,
    (a, b) => compareGenres(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: albumRows =
    level === 'albums' ? sortedAllAlbums : level === 'artist' ? sortedArtistAlbums : [];
  $: trackRows =
    level === 'songs'
      ? sortedSongs
      : level === 'album'
        ? sortedAlbumTracks
        : level === 'genre'
          ? sortedGenreTracks
          : [];
  $: showAlbumColumns = level === 'songs' || level === 'genre';
  $: showAlbumArtistColumn = level === 'albums';

  $: itemCount =
    level === 'artists'
      ? filteredArtists.length
      : level === 'albums'
        ? filteredAllAlbums.length
        : level === 'artist'
          ? filteredArtistAlbums.length
          : level === 'album'
            ? filteredAlbumTracks.length
            : level === 'genres'
              ? filteredGenres.length
              : level === 'genre'
                ? filteredGenreTracks.length
                : filteredSongs.length;

  $: breadcrumb = buildBreadcrumb(
    $musicBrowseMode,
    level,
    selectedArtist,
    selectedAlbum,
    $selectedGenre,
  );
  $: musicBreadcrumb.set(breadcrumb);
  $: canGoBack = level === 'artist' || level === 'album' || level === 'genre';

  $: emptyTitle =
    level === 'artists'
      ? 'No artists found'
      : level === 'albums' || level === 'artist'
        ? 'No albums found'
        : level === 'genres'
          ? 'No genres found'
          : 'No songs found';
  $: emptyHint = query
    ? 'Try a different search term.'
    : level === 'genre'
      ? 'This genre has no songs.'
      : 'Nothing to show here yet.';

  function buildBreadcrumb(
    mode: MusicBrowseMode,
    currentLevel: BrowseLevel,
    artist: Artist | null,
    albumEntry: AlbumEntry | null,
    genreName: string | null,
  ): string[] {
    const modeLabel = browseModes.find((entry) => entry.id === mode)?.label ?? 'Songs';
    const crumbs = ['Music', modeLabel];

    if (currentLevel === 'artist' && artist) {
      crumbs.push(artist.name);
    } else if (currentLevel === 'album' && albumEntry) {
      crumbs.push(albumEntry.artist.name, albumEntry.album.title);
    } else if (currentLevel === 'genre' && genreName) {
      crumbs.push(genreName);
    }

    return crumbs;
  }

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

  function selectArtist(artist: Artist) {
    selectedGenre.set(null);
    selectedArtistId.set(artist.id);
    selectedAlbumId.set(null);
  }

  function selectAlbum(entry: AlbumEntry) {
    selectedGenre.set(null);
    selectedArtistId.set(entry.artist.id);
    selectedAlbumId.set(entry.album.id);
  }

  function selectGenre(genre: GenreEntry) {
    selectedArtistId.set(null);
    selectedAlbumId.set(null);
    selectedGenre.set(genre.name);
  }

  function setBrowseMode(mode: MusicBrowseMode) {
    const modeChanged = mode !== $musicBrowseMode;
    const drilledDown = !!$selectedArtistId || !!$selectedAlbumId || !!$selectedGenre;

    // Re-selecting the active tab also returns to that mode's root.
    if (!modeChanged && !drilledDown) return;

    selectedArtistId.set(null);
    selectedAlbumId.set(null);
    selectedGenre.set(null);
    if (modeChanged) musicBrowseMode.set(mode);
  }

  function goBack() {
    if (level === 'album') {
      selectedAlbumId.set(null);
      if ($musicBrowseMode === 'albums') selectedArtistId.set(null);
      return;
    }

    if (level === 'artist') {
      selectedArtistId.set(null);
      return;
    }

    if (level === 'genre') {
      selectedGenre.set(null);
    }
  }

  function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /** Queue the currently visible tracks, starting at the clicked row. */
  function queueTracks(entries: TrackEntry[], index: number) {
    if (entries.length === 0) return;

    const queue: QueueTrack[] = entries.map(({ track, artist }) => ({
      id: track.id,
      title: track.title,
      artist: artist.name,
      duration: track.durationSeconds,
      src: DEMO_MEDIA_SRC,
    }));

    setQueue(queue, index);
    navigate('home');
  }

  /** Resolve the live row index so re-sorted lists queue the right position. */
  function queueTrack(entry: TrackEntry) {
    const index = trackRows.findIndex((item) => item.track.id === entry.track.id);
    if (index >= 0) queueTracks(trackRows, index);
  }

  const rowActionClass =
    'flex h-6 w-6 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60';

  function queueTrackOnly(entry: TrackEntry): void {
    const queueTrackEntry: QueueTrack = {
      id: entry.track.id,
      title: entry.track.title,
      artist: entry.artist.name,
      duration: entry.track.durationSeconds,
      src: DEMO_MEDIA_SRC,
    };

    addToQueue(queueTrackEntry);
    libraryImportLog.set(`Queued ${entry.track.title}`);
  }

  function playlistTrack(entry: TrackEntry, anchor: HTMLElement | null = null): void {
    openPlaylistTarget(
      {
        id: entry.track.id,
        title: entry.track.title,
        artist: entry.artist.name,
        duration: entry.track.durationSeconds,
        src: DEMO_MEDIA_SRC,
      },
      anchor,
    );
  }

  function dragTrack(event: DragEvent, entry: TrackEntry): void {
    startTrackDrag(event, {
      id: entry.track.id,
      title: entry.track.title,
      artist: entry.artist.name,
      duration: entry.track.durationSeconds,
      src: DEMO_MEDIA_SRC,
    });
  }
</script>

<svelte:window on:click={handleWindowPointer} on:keydown={handleWindowKeydown} />

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="shrink-0 border-b border-vlc-border px-4 sm:px-6">
    <div class="flex h-14 min-w-0 items-center gap-2 sm:gap-3">
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors {canGoBack
          ? 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'
          : 'text-vlc-dim opacity-50'} {focusRing}"
        title="Back"
        aria-label="Go back"
        disabled={!canGoBack}
        on:click={goBack}
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
      </button>

      <nav class="flex min-w-0 items-center gap-1.5 text-[13px] leading-none" aria-label="Breadcrumb">
        {#each breadcrumb as crumb, i}
          {#if i > 0}
            <ChevronRight size={14} strokeWidth={1.75} class="shrink-0 text-vlc-muted" aria-hidden="true" />
          {/if}
          <span
            class="min-w-0 truncate whitespace-nowrap {i === breadcrumb.length - 1
              ? 'text-vlc-text'
              : 'text-vlc-secondary'}"
            aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}
          >{crumb}</span>
        {/each}
      </nav>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        <div class="w-40 shrink md:w-56">
          {#key searchKey}
            <FuzzySearch placeholder="Search music…" on:search={handleSearch} />
          {/key}
        </div>

        <div class="relative" bind:this={sortRoot} on:focusout={handleSortFocusOut}>
          <button
            type="button"
            data-sort-trigger
            class="flex h-8 items-center gap-1.5 rounded-control px-2 text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
            title={`Sort: ${activeSortLabel} (${$musicSortDirection === 'asc' ? 'ascending' : 'descending'})`}
            aria-label={`Sort music, currently ${activeSortLabel}, ${$musicSortDirection === 'asc' ? 'ascending' : 'descending'}`}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            aria-controls={sortOpen ? 'music-sort-menu' : undefined}
            on:click={toggleSortMenu}
          >
            <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
            <span class="hidden whitespace-nowrap text-xs sm:inline">{activeSortLabel}</span>
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
    </div>

    <div class="flex h-11 items-center gap-3 border-t border-vlc-border/60">
      <div
        class="inline-flex items-center gap-0.5 rounded-control border border-vlc-border bg-vlc-card p-0.5"
        role="group"
        aria-label="Browse music by"
      >
        {#each browseModes as mode (mode.id)}
          {@const active = $musicBrowseMode === mode.id}
          <button
            type="button"
            class="h-7 rounded-input px-3 text-xs transition-colors {active
              ? 'bg-vlc-raised text-vlc-text'
              : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-card"
            aria-pressed={active}
            on:click={() => setBrowseMode(mode.id)}
          >
            {mode.label}
          </button>
        {/each}
      </div>

      <span class="ml-auto whitespace-nowrap text-xs text-vlc-muted" aria-live="polite">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if level === 'artist' && selectedArtist}
      <div class="flex flex-col gap-4 border-b border-vlc-border px-4 py-5 sm:flex-row sm:items-center sm:px-6">
        <MusicCover emoji="🎤" size="xl" />
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-wide text-vlc-muted">Artist</p>
          <h1 class="truncate text-xl font-semibold text-vlc-text sm:text-2xl">{selectedArtist.name}</h1>
          <p class="mt-1 text-[13px] text-vlc-secondary">
            {selectedArtist.albumCount} albums • {formatDuration(artistDuration(selectedArtist))}
          </p>
        </div>
      </div>
    {:else if level === 'album' && selectedAlbum}
      <div class="border-b border-vlc-border px-4 py-5 sm:px-6">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
          <MusicCover emoji="💿" size="xl" />
          <div class="min-w-0 flex-1">
            <p class="text-[11px] uppercase tracking-wide text-vlc-muted">Album</p>
            <h1 class="truncate text-xl font-semibold text-vlc-text sm:text-2xl">
              {selectedAlbum.album.title}
            </h1>
            <p class="mt-1 text-[13px] text-vlc-secondary">
              {selectedAlbum.artist.name} • {selectedAlbum.album.year} • {selectedAlbum.album.trackCount} tracks
            </p>
            <p class="mt-0.5 text-xs text-vlc-muted">
              {albumGenre(selectedAlbum.album)} • {formatDuration(selectedAlbum.album.durationSeconds)}
            </p>

            <div class="mt-4 flex h-10 items-end gap-[2px] overflow-hidden" aria-hidden="true">
              {#each waveformBars as bar, index}
                <span
                  class="w-1 shrink-0 rounded-full {index % 5 === 0 ? 'bg-vlc-orange/50' : 'bg-vlc-muted/30'}"
                  style={`height: ${bar}%`}
                ></span>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if level === 'genre' && selectedGenreEntry}
      <div class="flex items-center gap-4 border-b border-vlc-border px-4 py-5 sm:px-6">
        <MusicCover emoji="🎧" size="lg" />
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-wide text-vlc-muted">Genre</p>
          <h1 class="truncate text-xl font-semibold text-vlc-text sm:text-2xl">{selectedGenreEntry.name}</h1>
          <p class="mt-1 text-[13px] text-vlc-secondary">
            {selectedGenreEntry.trackCount} songs • {selectedGenreEntry.albumCount} albums • {formatDuration(selectedGenreEntry.durationSeconds)}
          </p>
        </div>
      </div>
    {/if}

    {#if itemCount === 0}
      <div class="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <Music2 size={28} strokeWidth={1.5} class="text-vlc-dim" aria-hidden="true" />
        <p class="text-sm font-medium text-vlc-secondary">{emptyTitle}</p>
        <p class="text-xs text-vlc-muted">{emptyHint}</p>
        {#if query}
          <button
            type="button"
            class="mt-2 rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text {focusRing}"
            on:click={clearSearch}
          >
            Clear search
          </button>
        {:else if level === 'genre'}
          <button
            type="button"
            class="mt-2 rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text {focusRing}"
            on:click={goBack}
          >
            Back to genres
          </button>
        {/if}
      </div>
    {:else if level === 'artists'}
      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each sortedArtists as artist (artist.id)}
            <button
              type="button"
              class="group block w-full rounded-control text-left {focusRing}"
              title={`Open ${artist.name}`}
              on:click={() => selectArtist(artist)}
            >
              <div class="relative aspect-square w-full">
                <MusicCover
                  emoji="🎤"
                  size="fill"
                  className="transition-colors group-hover:border-vlc-borderStrong"
                />
              </div>
              <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{artist.name}</div>
              <div class="truncate text-[11px] text-vlc-muted">
                {artist.albumCount} albums • {formatDuration(artistDuration(artist))}
              </div>
            </button>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div class="px-4 py-4 sm:px-6">
          <div
            class="flex items-center gap-3 border-b border-vlc-border px-3 pb-2 text-[11px] uppercase tracking-wide text-vlc-muted"
            aria-hidden="true"
          >
            <span class="min-w-0 flex-1">Name</span>
            <span class="w-20 shrink-0 text-right">Albums</span>
            <span class="w-20 shrink-0 text-right">Duration</span>
          </div>
          <div class="mt-1">
            {#each sortedArtists as artist (artist.id)}
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised {focusRing}"
                title={`Open ${artist.name}`}
                on:click={() => selectArtist(artist)}
              >
                <MusicCover emoji="🎤" size="sm" />
                <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{artist.name}</span>
                <span class="w-20 shrink-0 text-right text-xs text-vlc-secondary">{artist.albumCount} albums</span>
                <span class="w-20 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(artistDuration(artist))}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="px-4 py-2 sm:px-6">
          {#each sortedArtists as artist (artist.id)}
            <button
              type="button"
              class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {focusRing}"
              title={`Open ${artist.name}`}
              on:click={() => selectArtist(artist)}
            >
              <span class="min-w-0 flex-1 truncate text-vlc-text">{artist.name}</span>
              <span class="w-20 shrink-0 text-right text-[11px] text-vlc-muted">{artist.albumCount} albums</span>
              <span class="w-14 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(artistDuration(artist))}</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if level === 'albums' || level === 'artist'}
      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each albumRows as entry (entry.album.id)}
            <button
              type="button"
              class="group block w-full rounded-control text-left {focusRing}"
              title={`Open ${entry.album.title}`}
              on:click={() => selectAlbum(entry)}
            >
              <div class="relative aspect-square w-full">
                <MusicCover
                  emoji="💿"
                  size="fill"
                  className="transition-colors group-hover:border-vlc-borderStrong"
                />
              </div>
              <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{entry.album.title}</div>
              <div class="truncate text-[11px] text-vlc-muted">
                {#if showAlbumArtistColumn}{entry.artist.name} • {/if}{entry.album.year} • {entry.album.trackCount} tracks
              </div>
            </button>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div class="px-4 py-4 sm:px-6">
          <div
            class="flex items-center gap-3 border-b border-vlc-border px-3 pb-2 text-[11px] uppercase tracking-wide text-vlc-muted"
            aria-hidden="true"
          >
            <span class="min-w-0 flex-1">Title</span>
            {#if showAlbumArtistColumn}<span class="w-36 shrink-0">Artist</span>{/if}
            <span class="w-12 shrink-0 text-right">Year</span>
            <span class="w-16 shrink-0 text-right">Tracks</span>
            <span class="w-14 shrink-0 text-right">Duration</span>
          </div>
          <div class="mt-1">
            {#each albumRows as entry (entry.album.id)}
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised {focusRing}"
                title={`Open ${entry.album.title}`}
                on:click={() => selectAlbum(entry)}
              >
                <MusicCover emoji="💿" size="sm" />
                <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{entry.album.title}</span>
                {#if showAlbumArtistColumn}
                  <span class="w-36 shrink-0 truncate text-xs text-vlc-secondary">{entry.artist.name}</span>
                {/if}
                <span class="w-12 shrink-0 text-right text-xs text-vlc-muted">{entry.album.year}</span>
                <span class="w-16 shrink-0 text-right text-xs text-vlc-muted">{entry.album.trackCount} tracks</span>
                <span class="w-14 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(entry.album.durationSeconds)}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="px-4 py-2 sm:px-6">
          {#each albumRows as entry (entry.album.id)}
            <button
              type="button"
              class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {focusRing}"
              title={`Open ${entry.album.title}`}
              on:click={() => selectAlbum(entry)}
            >
              <span class="min-w-0 flex-1 truncate text-vlc-text">{entry.album.title}</span>
              {#if showAlbumArtistColumn}
                <span class="hidden w-36 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block">{entry.artist.name}</span>
              {/if}
              <span class="w-10 shrink-0 text-right text-[11px] text-vlc-muted">{entry.album.year}</span>
              <span class="w-16 shrink-0 text-right text-[11px] text-vlc-muted">{entry.album.trackCount} tracks</span>
              <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(entry.album.durationSeconds)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if level === 'album' || level === 'songs' || level === 'genre'}
      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each trackRows as entry, i (entry.track.id)}
            {@const position = level === 'album' ? entry.track.trackNumber : i + 1}
            <div
              class="group relative"
              role="group"
              aria-label={`${entry.track.title} actions`}
              draggable="true"
              on:dragstart={(event) => dragTrack(event, entry)}
            >
              <button
                type="button"
                class="block w-full rounded-control text-left {focusRing}"
                title={`Play ${entry.track.title}. Drag to add to the queue.`}
                on:click={() => queueTrack(entry)}
              >
                <div class="relative aspect-square w-full">
                  <MusicCover
                    emoji={level === 'album' ? '💿' : '🎵'}
                    size="fill"
                    className="transition-colors group-hover:border-vlc-borderStrong"
                  />
                  <span class="absolute left-2 top-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] text-vlc-secondary">
                    {position}
                  </span>
                  <span class="absolute bottom-2 right-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] text-vlc-secondary">
                    {formatDuration(entry.track.durationSeconds)}
                  </span>
                </div>
                <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{entry.track.title}</div>
                <div class="truncate text-[11px] text-vlc-muted">
                  {entry.artist.name}{#if showAlbumColumns} • {entry.album.title}{/if}
                </div>
              </button>

              <div
                class="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-control bg-vlc-panel/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <button
                  type="button"
                  class={rowActionClass}
                  title="Add to queue"
                  aria-label={`Add ${entry.track.title} to the queue`}
                  on:click={() => queueTrackOnly(entry)}
                >
                  <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class={rowActionClass}
                  title="Add to playlist"
                  aria-label={`Add ${entry.track.title} to a playlist`}
                  on:click={(event) =>
                    playlistTrack(
                      entry,
                      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
                    )}
                >
                  <ListPlus size={13} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div>
          <div
            class="flex items-center gap-3 border-b border-vlc-border px-4 py-2 text-[11px] uppercase tracking-wide text-vlc-muted sm:px-6"
            aria-hidden="true"
          >
            <span class="w-7 shrink-0">#</span>
            <span class="min-w-0 flex-1">Title</span>
            <span class="w-32 shrink-0 truncate">Artist</span>
            {#if showAlbumColumns}<span class="hidden w-40 shrink-0 truncate lg:block">Album</span>{/if}
            {#if showAlbumColumns}<span class="w-12 shrink-0 text-right">Year</span>{/if}
            <span class="w-12 shrink-0 text-right">Duration</span>
          </div>
          {#each trackRows as entry, i (entry.track.id)}
            {@const position = level === 'album' ? entry.track.trackNumber : i + 1}
            <div
              class="group relative"
              role="group"
              aria-label={`${entry.track.title} actions`}
              draggable="true"
              on:dragstart={(event) => dragTrack(event, entry)}
            >
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-control px-4 py-2 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-raised {focusRing} sm:px-6"
                title={`Play ${entry.track.title}. Drag to add to the queue.`}
                on:click={() => queueTrack(entry)}
              >
                <span class="w-7 shrink-0 text-vlc-muted">{position}</span>
                <span class="min-w-0 flex-1 truncate text-vlc-text">{entry.track.title}</span>
                <span class="w-32 shrink-0 truncate">{entry.artist.name}</span>
                {#if showAlbumColumns}
                  <span class="hidden w-40 shrink-0 truncate lg:block">{entry.album.title}</span>
                {/if}
                {#if showAlbumColumns}
                  <span class="w-12 shrink-0 text-right text-vlc-muted">{entry.album.year}</span>
                {/if}
                <span class="w-12 shrink-0 text-right text-vlc-muted">{formatDuration(entry.track.durationSeconds)}</span>
              </button>

              <div
                class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-control bg-vlc-panel/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <button
                  type="button"
                  class={rowActionClass}
                  title="Add to queue"
                  aria-label={`Add ${entry.track.title} to the queue`}
                  on:click={() => queueTrackOnly(entry)}
                >
                  <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class={rowActionClass}
                  title="Add to playlist"
                  aria-label={`Add ${entry.track.title} to a playlist`}
                  on:click={(event) =>
                    playlistTrack(
                      entry,
                      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
                    )}
                >
                  <ListPlus size={13} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-4 py-2 sm:px-6">
          {#each trackRows as entry, i (entry.track.id)}
            {@const position = level === 'album' ? entry.track.trackNumber : i + 1}
            <div
              class="group relative border-b border-vlc-border/40 last:border-b-0"
              role="group"
              aria-label={`${entry.track.title} actions`}
              draggable="true"
              on:dragstart={(event) => dragTrack(event, entry)}
            >
              <button
                type="button"
                class="flex h-8 w-full items-center gap-3 rounded-input px-2 text-left text-xs transition-colors hover:bg-vlc-raised {focusRing}"
                title={`Play ${entry.track.title}. Drag to add to the queue.`}
                on:click={() => queueTrack(entry)}
              >
                <span class="w-6 shrink-0 text-right text-[11px] text-vlc-muted">{position}</span>
                <span class="min-w-0 flex-1 truncate text-vlc-text">{entry.track.title}</span>
                <span class="hidden w-32 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block">{entry.artist.name}</span>
                {#if showAlbumColumns}
                  <span class="hidden w-40 shrink-0 truncate text-right text-[11px] text-vlc-muted lg:block">{entry.album.title}</span>
                {/if}
                <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(entry.track.durationSeconds)}</span>
              </button>

              <div
                class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-control bg-vlc-panel/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <button
                  type="button"
                  class={rowActionClass}
                  title="Add to queue"
                  aria-label={`Add ${entry.track.title} to the queue`}
                  on:click={() => queueTrackOnly(entry)}
                >
                  <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class={rowActionClass}
                  title="Add to playlist"
                  aria-label={`Add ${entry.track.title} to a playlist`}
                  on:click={(event) =>
                    playlistTrack(
                      entry,
                      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
                    )}
                >
                  <ListPlus size={13} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      {#if $musicViewMode === 'grid'}
        <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {#each sortedGenres as genre (genre.name)}
            <button
              type="button"
              class="group block w-full rounded-control text-left {focusRing}"
              title={`Open ${genre.name}`}
              on:click={() => selectGenre(genre)}
            >
              <div class="relative aspect-square w-full">
                <MusicCover
                  emoji="🎧"
                  size="fill"
                  className="transition-colors group-hover:border-vlc-borderStrong"
                />
              </div>
              <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{genre.name}</div>
              <div class="truncate text-[11px] text-vlc-muted">
                {genre.trackCount} songs • {genre.albumCount} albums
              </div>
            </button>
          {/each}
        </div>
      {:else if $musicViewMode === 'list'}
        <div class="px-4 py-4 sm:px-6">
          <div
            class="flex items-center gap-3 border-b border-vlc-border px-3 pb-2 text-[11px] uppercase tracking-wide text-vlc-muted"
            aria-hidden="true"
          >
            <span class="min-w-0 flex-1">Genre</span>
            <span class="w-16 shrink-0 text-right">Songs</span>
            <span class="w-16 shrink-0 text-right">Albums</span>
            <span class="w-16 shrink-0 text-right">Duration</span>
          </div>
          <div class="mt-1">
            {#each sortedGenres as genre (genre.name)}
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised {focusRing}"
                title={`Open ${genre.name}`}
                on:click={() => selectGenre(genre)}
              >
                <MusicCover emoji="🎧" size="sm" />
                <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{genre.name}</span>
                <span class="w-16 shrink-0 text-right text-xs text-vlc-secondary">{genre.trackCount} songs</span>
                <span class="w-16 shrink-0 text-right text-xs text-vlc-muted">{genre.albumCount} albums</span>
                <span class="w-16 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(genre.durationSeconds)}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="px-4 py-2 sm:px-6">
          {#each sortedGenres as genre (genre.name)}
            <button
              type="button"
              class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {focusRing}"
              title={`Open ${genre.name}`}
              on:click={() => selectGenre(genre)}
            >
              <span class="min-w-0 flex-1 truncate text-vlc-text">{genre.name}</span>
              <span class="w-16 shrink-0 text-right text-[11px] text-vlc-muted">{genre.trackCount} songs</span>
              <span class="w-16 shrink-0 text-right text-[11px] text-vlc-muted">{genre.albumCount} albums</span>
              <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(genre.durationSeconds)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
