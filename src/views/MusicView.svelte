<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount, tick } from 'svelte';
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
    compareAlbumOrder,
    ensureMusicCover,
    musicCovers,
    musicTracks,
    recordMusicListen,
    toPlayerTrack,
    UNKNOWN_ARTIST,
    UNKNOWN_GENRE,
    type MusicTrack,
  } from '../stores/musicLibrary';
  import {
    musicBreadcrumb,
    musicBrowseMode,
    musicFolderRootPath,
    musicFolderSegments,
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
  import { isUnderRoot, libraryImportLog } from '../stores/library';
  import { startTrackDrag } from '../lib/dragTrack';
  import { addToQueue, setQueue } from '../stores/player';
  import { openPlaylistTarget } from '../stores/playlistTarget';
  import { settings } from '../stores/settings';
  import { openFolderContextMenu, openMediaContextMenu } from '../stores/ui';
  import { t } from '../lib/t';
  import FuzzySearch from '../components/FuzzySearch.svelte';
  import MusicCover from '../components/MusicCover.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';

  type BrowseLevel =
    | 'artists'
    | 'artist'
    | 'albums'
    | 'album'
    | 'songs'
    | 'genres'
    | 'genre'
    | 'folders'
    | 'folder';

  interface SortOption {
    key: MusicSortKey;
    label: string;
  }

  interface ArtistEntry {
    name: string;
    albumCount: number;
    trackCount: number;
    duration: number;
    /** First track with artwork (else the first track) — the card cover source. */
    representative: MusicTrack | null;
  }

  interface AlbumEntry {
    /** `artist\0album` identity used by `selectedAlbumId`. */
    key: string;
    artist: string;
    title: string;
    year: number | null;
    tracks: MusicTrack[];
    representative: MusicTrack | null;
  }

  interface GenreEntry {
    name: string;
    trackCount: number;
    albumCount: number;
    duration: number;
  }

  /** A configured music root or one of its subfolders on the Folders tab. */
  interface MusicFolderCard {
    name: string;
    /** `Name[ParentName]` when duplicate-named roots need disambiguation. */
    displayName: string;
    /** Absolute folder path — doubles as the folder context-menu id. */
    path: string;
    directCount: number;
    totalTracks: number;
    duration: number;
    representative: MusicTrack | null;
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app';

  const browseModes: Array<{ id: MusicBrowseMode; label: string }> = [
    { id: 'artists', label: t('music.tabs.artists') },
    { id: 'albums', label: t('music.tabs.albums') },
    { id: 'songs', label: t('music.tabs.songs') },
    { id: 'genres', label: t('music.tabs.genres') },
    { id: 'folders', label: t('music.tabs.folders') },
  ];

  /* ---------- Small path helpers (mirror the library navigation patterns) ---------- */

  function trimTrailingSeparator(path: string): string {
    return path.replace(/[\\/]+$/, '');
  }

  function basenameOf(path: string): string {
    const parts = trimTrailingSeparator(path).split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }

  /** Parent folder segment of a path, used for `Name[ParentName]` disambiguation. */
  function parentSegmentOf(path: string): string {
    const parts = trimTrailingSeparator(path).split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 2] ?? '';
  }

  /** Normalized path key: trailing separators stripped, case folded. */
  function pathKey(path: string): string {
    return trimTrailingSeparator(path).toLowerCase();
  }

  /**
   * Path segments of `path` below `root` (the trailing filename included, so a
   * track directly inside the root yields a single segment).
   */
  function relativePartsUnder(path: string, root: string): string[] {
    const cleanRoot = trimTrailingSeparator(root);
    if (!isUnderRoot(path, cleanRoot)) return [];
    return path
      .slice(cleanRoot.length)
      .split(/[\\/]+/)
      .filter(Boolean);
  }

  /** Case-insensitive match of a track's folder chain below the active root. */
  function chainMatches(parts: string[], chain: string[]): boolean {
    return chain.every(
      (segment, index) => segment.toLowerCase() === (parts[index] ?? '').toLowerCase(),
    );
  }

  /* ---------- View-model builders (side effect: warm the cover cache) ---------- */

  function representativeOf(tracks: MusicTrack[]): MusicTrack | null {
    const representative = tracks.find((track) => track.hasCover) ?? tracks[0] ?? null;
    if (representative) ensureMusicCover(representative);
    return representative;
  }

  function buildArtistEntries(tracks: MusicTrack[]): ArtistEntry[] {
    const groups = new Map<string, { name: string; albums: Set<string>; tracks: MusicTrack[] }>();

    for (const track of tracks) {
      const name = track.albumArtist || track.artist || UNKNOWN_ARTIST;
      const key = name.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { name, albums: new Set(), tracks: [] };
        groups.set(key, group);
      }
      group.albums.add(track.album.toLowerCase());
      group.tracks.push(track);
    }

    return Array.from(groups.values())
      .map((group) => ({
        name: group.name,
        albumCount: group.albums.size,
        trackCount: group.tracks.length,
        duration: group.tracks.reduce((total, track) => total + track.durationSeconds, 0),
        representative: representativeOf(group.tracks),
      }))
      .sort((a, b) => {
        const aUnknown = a.name === UNKNOWN_ARTIST;
        const bUnknown = b.name === UNKNOWN_ARTIST;
        if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
        return collator.compare(a.name, b.name);
      });
  }

  function albumKeyOf(artist: string, album: string): string {
    return `${artist.toLowerCase()}\u0000${album.toLowerCase()}`;
  }

  function buildAlbumEntries(tracks: MusicTrack[]): AlbumEntry[] {
    const groups = new Map<string, AlbumEntry>();

    for (const track of tracks) {
      const artist = track.albumArtist || track.artist || UNKNOWN_ARTIST;
      const key = albumKeyOf(artist, track.album);
      let group = groups.get(key);
      if (!group) {
        group = { key, artist, title: track.album, year: track.year, tracks: [], representative: null };
        groups.set(key, group);
      }
      group.tracks.push(track);
      if (group.year === null) group.year = track.year;
    }

    const entries = Array.from(groups.values());
    for (const entry of entries) {
      entry.tracks.sort(compareAlbumOrder);
      entry.representative = representativeOf(entry.tracks);
    }
    return entries;
  }

  function buildGenreEntries(tracks: MusicTrack[]): GenreEntry[] {
    const groups = new Map<string, { name: string; albums: Set<string>; trackCount: number; duration: number }>();

    for (const track of tracks) {
      const name = track.genre ?? UNKNOWN_GENRE;
      const key = name.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { name, albums: new Set(), trackCount: 0, duration: 0 };
        groups.set(key, group);
      }
      group.albums.add(track.album.toLowerCase());
      group.trackCount += 1;
      group.duration += track.durationSeconds;
    }

    return Array.from(groups.values())
      .map((group) => ({
        name: group.name,
        trackCount: group.trackCount,
        albumCount: group.albums.size,
        duration: group.duration,
      }))
      .sort((a, b) => {
        const aUnknown = a.name === UNKNOWN_GENRE;
        const bUnknown = b.name === UNKNOWN_GENRE;
        if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
        return collator.compare(a.name, b.name);
      });
  }

  /**
   * Folder cards for the configured music roots. Duplicate-named roots stay
   * distinct cards and carry a `Name[ParentName]` display label (display-only,
   * mirroring the video library's sibling disambiguation).
   */
  function buildFolderRootCards(roots: string[], tracks: MusicTrack[]): MusicFolderCard[] {
    const nameCounts = new Map<string, number>();
    for (const root of roots) {
      const name = basenameOf(root);
      if (!name) continue;
      const key = name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }

    const cards: MusicFolderCard[] = [];
    const seenPaths = new Set<string>();

    for (const root of roots) {
      const clean = trimTrailingSeparator(root);
      const pathId = pathKey(clean);
      if (!pathId || seenPaths.has(pathId)) continue;
      seenPaths.add(pathId);

      const name = basenameOf(clean);
      const ambiguous = (nameCounts.get(name.toLowerCase()) ?? 0) > 1;
      const inside = tracks.filter((track) => isUnderRoot(track.path, clean));
      const direct = inside.filter((track) => relativePartsUnder(track.path, clean).length === 1);

      cards.push({
        name,
        displayName: ambiguous ? `${name}[${parentSegmentOf(clean)}]` : name,
        path: root,
        directCount: direct.length,
        totalTracks: inside.length,
        duration: inside.reduce((total, track) => total + track.durationSeconds, 0),
        representative: representativeOf(direct.length > 0 ? direct : inside),
      });
    }

    return cards.sort((a, b) => collator.compare(a.name, b.name));
  }

  /**
   * Subfolder cards one level below `chain` inside `rootPath`, derived from the
   * scanned tracks under that root (folders without audio anywhere beneath
   * them are not part of the music library tree).
   */
  function buildFolderSubCards(
    rootPath: string | null,
    chain: string[],
    tracks: MusicTrack[],
  ): MusicFolderCard[] {
    if (!rootPath) return [];
    const cleanRoot = trimTrailingSeparator(rootPath);

    const order: string[] = [];
    const grouped = new Map<string, MusicTrack[]>();

    for (const track of tracks) {
      const parts = relativePartsUnder(track.path, cleanRoot);
      if (parts.length <= chain.length + 1 || !chainMatches(parts, chain)) continue;
      const name = parts[chain.length];
      const key = name.toLowerCase();
      let bucket = grouped.get(key);
      if (!bucket) {
        bucket = [];
        grouped.set(key, bucket);
        order.push(name);
      }
      bucket.push(track);
    }

    return order.map((name) => {
      const inside = grouped.get(name.toLowerCase()) ?? [];
      const direct = inside.filter(
        (track) => relativePartsUnder(track.path, cleanRoot).length === chain.length + 2,
      );
      return {
        name,
        displayName: name,
        path: [cleanRoot, ...chain, name].join('/'),
        directCount: direct.length,
        totalTracks: inside.length,
        duration: inside.reduce((total, track) => total + track.durationSeconds, 0),
        representative: representativeOf(direct.length > 0 ? direct : inside),
      };
    });
  }

  /** Audio tracks sitting directly inside the folder at `chain` below `rootPath`. */
  function buildFolderDirectTracks(
    rootPath: string | null,
    chain: string[],
    tracks: MusicTrack[],
  ): MusicTrack[] {
    if (!rootPath) return [];
    const cleanRoot = trimTrailingSeparator(rootPath);
    return tracks.filter((track) => {
      const parts = relativePartsUnder(track.path, cleanRoot);
      return parts.length === chain.length + 1 && chainMatches(parts, chain);
    });
  }

  /* ---------- Search ---------- */

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

  /* ---------- Level resolution ---------- */

  function resolveLevel(
    mode: MusicBrowseMode,
    artistId: string | null,
    albumId: string | null,
    genreName: string | null,
    folderSegments: string[],
  ): BrowseLevel {
    if (mode === 'artists') {
      if (albumId) return 'album';
      if (artistId) return 'artist';
      return 'artists';
    }
    if (mode === 'albums') return albumId ? 'album' : 'albums';
    if (mode === 'genres') return genreName ? 'genre' : 'genres';
    if (mode === 'folders') return folderSegments.length > 0 ? 'folder' : 'folders';
    return 'songs';
  }

  function getSortOptions(level: BrowseLevel): SortOption[] {
    switch (level) {
      case 'songs':
      case 'genre':
      case 'folder':
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
      case 'folders':
        return [
          { key: 'title', label: 'Name' },
          { key: 'album', label: 'Tracks' },
          { key: 'duration', label: 'Duration' },
        ];
    }
  }

  /* ---------- Comparators ---------- */

  function artistNameOf(track: MusicTrack): string {
    return track.albumArtist || track.artist || UNKNOWN_ARTIST;
  }

  function albumDuration(entry: AlbumEntry): number {
    return entry.tracks.reduce((total, track) => total + track.durationSeconds, 0);
  }

  /** Ascending puts unknown years last; the direction flip then keeps them last. */
  function compareYear(a: number | null, b: number | null): number {
    if ((a ?? null) === (b ?? null)) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  }

  function compareArtists(a: ArtistEntry, b: ArtistEntry, key: MusicSortKey): number {
    switch (key) {
      case 'album':
        return a.albumCount - b.albumCount;
      case 'duration':
        return a.duration - b.duration;
      default:
        return collator.compare(a.name, b.name);
    }
  }

  function compareAlbums(a: AlbumEntry, b: AlbumEntry, key: MusicSortKey): number {
    switch (key) {
      case 'artist':
        return collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title);
      case 'year':
        return compareYear(a.year, b.year);
      case 'duration':
        return albumDuration(a) - albumDuration(b);
      default:
        return collator.compare(a.title, b.title) || collator.compare(a.artist, b.artist);
    }
  }

  function compareTracks(a: MusicTrack, b: MusicTrack, key: MusicSortKey): number {
    switch (key) {
      case 'artist':
        return (
          collator.compare(artistNameOf(a), artistNameOf(b)) || collator.compare(a.title, b.title)
        );
      case 'album':
        return collator.compare(a.album, b.album) || compareAlbumOrder(a, b);
      case 'year':
        return compareYear(a.year, b.year);
      case 'duration':
        return a.durationSeconds - b.durationSeconds;
      default:
        return collator.compare(a.title, b.title);
    }
  }

  function compareGenres(a: GenreEntry, b: GenreEntry, key: MusicSortKey): number {
    switch (key) {
      case 'album':
        return a.trackCount - b.trackCount;
      case 'duration':
        return a.duration - b.duration;
      default:
        return collator.compare(a.name, b.name);
    }
  }

  function compareFolders(a: MusicFolderCard, b: MusicFolderCard, key: MusicSortKey): number {
    switch (key) {
      case 'album':
        return a.totalTracks - b.totalTracks;
      case 'duration':
        return a.duration - b.duration;
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

  /* ---------- Reactive data ---------- */

  $: artistEntries = buildArtistEntries($musicTracks);
  $: albumEntries = buildAlbumEntries($musicTracks);
  $: genreEntries = buildGenreEntries($musicTracks);

  $: folderRootCards = buildFolderRootCards($settings.musicLibraryFolders, $musicTracks);
  $: folderChain = $musicFolderSegments.slice(1);
  $: folderSubCards = buildFolderSubCards($musicFolderRootPath, folderChain, $musicTracks);
  $: folderDirectTracks = buildFolderDirectTracks($musicFolderRootPath, folderChain, $musicTracks);

  $: selectedArtistEntry = (() => {
    const artistName = $selectedArtistId;
    if (!artistName) return null;
    return artistEntries.find((entry) => entry.name === artistName) ?? null;
  })();
  $: selectedAlbumEntry = (() => {
    const albumKey = $selectedAlbumId;
    if (!albumKey) return null;
    return albumEntries.find((entry) => entry.key === albumKey) ?? null;
  })();
  $: selectedGenreEntry = (() => {
    const genreName = $selectedGenre;
    if (!genreName) return null;
    return genreEntries.find((genre) => genre.name === genreName) ?? null;
  })();
  $: folderRootCard = (() => {
    const rootPath = $musicFolderRootPath;
    if (!rootPath) return null;
    const key = pathKey(rootPath);
    return folderRootCards.find((card) => pathKey(card.path) === key) ?? null;
  })();

  $: level = resolveLevel(
    $musicBrowseMode,
    $selectedArtistId,
    $selectedAlbumId,
    $selectedGenre,
    $musicFolderSegments,
  );

  $: sortOptions = getSortOptions(level);
  $: activeSortKey = sortOptions.some((option) => option.key === $musicSort)
    ? $musicSort
    : sortOptions[0].key;
  $: activeSortLabel = sortOptions.find((option) => option.key === activeSortKey)?.label ?? 'Title';

  $: filteredArtists = artistEntries.filter((entry) => matches([entry.name]));
  $: sortedArtists = sortStable(
    filteredArtists,
    (a, b) => compareArtists(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredAllAlbums = albumEntries.filter((entry) =>
    matches([entry.title, entry.artist, entry.year ?? '']),
  );
  $: sortedAllAlbums = sortStable(
    filteredAllAlbums,
    (a, b) => compareAlbums(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredArtistAlbums = (() => {
    const artist = selectedArtistEntry;
    if (!artist) return [];
    const artistKey = artist.name.toLowerCase();
    return albumEntries
      .filter((entry) => entry.artist.toLowerCase() === artistKey)
      .filter((entry) => matches([entry.title, entry.year ?? '']));
  })();
  $: sortedArtistAlbums = sortStable(
    filteredArtistAlbums,
    (a, b) => compareAlbums(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredSongs = $musicTracks.filter((track) =>
    matches([track.title, artistNameOf(track), track.album, track.genre ?? '', track.year ?? '']),
  );
  $: sortedSongs = sortStable(
    filteredSongs,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredAlbumTracks = (() => {
    const album = selectedAlbumEntry;
    if (!album) return [];
    return album.tracks.filter((track) => matches([track.title, track.genre ?? '']));
  })();
  $: sortedAlbumTracks = sortStable(
    filteredAlbumTracks,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredGenreTracks = (() => {
    const genreName = $selectedGenre;
    if (!genreName) return [];
    const key = genreName.toLowerCase();
    return $musicTracks.filter(
      (track) => (track.genre ?? UNKNOWN_GENRE).toLowerCase() === key,
    );
  })();
  $: sortedGenreTracks = sortStable(
    filteredGenreTracks,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredGenres = genreEntries.filter((genre) => matches([genre.name]));
  $: sortedGenres = sortStable(
    filteredGenres,
    (a, b) => compareGenres(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredFolderRootCards = folderRootCards.filter((card) =>
    matches([card.displayName, card.name]),
  );
  $: sortedFolderRootCards = sortStable(
    filteredFolderRootCards,
    (a, b) => compareFolders(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: filteredFolderSubCards = folderSubCards.filter((card) => matches([card.name]));
  $: sortedFolderSubCards = sortStable(
    filteredFolderSubCards,
    (a, b) => compareFolders(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: folderCards = level === 'folders' ? sortedFolderRootCards : sortedFolderSubCards;
  $: folderCardsVisible = (level === 'folders' || level === 'folder') && folderCards.length > 0;

  $: filteredFolderTracks = folderDirectTracks.filter((track) =>
    matches([track.title, artistNameOf(track), track.album, track.genre ?? '']),
  );
  $: sortedFolderTracks = sortStable(
    filteredFolderTracks,
    (a, b) => compareTracks(a, b, activeSortKey),
    $musicSortDirection,
  );

  $: trackRows =
    level === 'songs'
      ? sortedSongs
      : level === 'album'
        ? sortedAlbumTracks
        : level === 'genre'
          ? sortedGenreTracks
          : level === 'folder'
            ? sortedFolderTracks
            : [];

  $: albumRows =
    level === 'albums' ? sortedAllAlbums : level === 'artist' ? sortedArtistAlbums : [];

  // Decorative amplitude strip on the album header.
  const waveformBars = Array.from({ length: 72 }, (_, index) => {
    const wave = Math.abs(Math.sin((index + 1) * 0.52) * Math.cos((index + 1) * 0.19));
    return 16 + Math.round(wave * 72);
  });

  $: showTrackBlock =
    level === 'songs' ||
    level === 'album' ||
    level === 'genre' ||
    (level === 'folder' && trackRows.length > 0);
  $: showAlbumColumns = level === 'songs' || level === 'genre' || level === 'folder';
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
                : level === 'folders'
                  ? filteredFolderRootCards.length
                  : level === 'folder'
                    ? filteredFolderSubCards.length + filteredFolderTracks.length
                    : filteredSongs.length;

  $: breadcrumb = buildBreadcrumb(
    $musicBrowseMode,
    level,
    selectedArtistEntry,
    selectedAlbumEntry,
    $selectedGenre,
    folderRootCard,
    folderChain,
  );
  $: musicBreadcrumb.set(breadcrumb);
  $: canGoBack = level === 'artist' || level === 'album' || level === 'genre' || level === 'folder';

  $: emptyTitle =
    level === 'artists'
      ? t('music.artists_empty_title')
      : level === 'albums' || level === 'artist'
        ? t('music.albums_empty_title')
        : level === 'genres'
          ? t('music.genres_empty_title')
          : level === 'folders'
            ? t('music.folders_empty_title')
            : t('music.songs_empty_title');
  $: emptyHint = query
    ? t('music.empty_search_hint')
    : level === 'genre'
      ? t('music.genre_empty_hint')
      : t('music.empty_default_hint');

  function buildBreadcrumb(
    mode: MusicBrowseMode,
    currentLevel: BrowseLevel,
    artist: ArtistEntry | null,
    albumEntry: AlbumEntry | null,
    genreName: string | null,
    rootCard: MusicFolderCard | null,
    chain: string[],
  ): string[] {
    const modeLabel = browseModes.find((entry) => entry.id === mode)?.label ?? t('music.tabs.songs');
    const crumbs = [t('music.breadcrumb_root'), modeLabel];

    if (mode === 'folders') {
      if (currentLevel === 'folder' && rootCard) {
        crumbs.push(rootCard.displayName, ...chain);
      }
      return crumbs;
    }

    if (currentLevel === 'artist' && artist) {
      crumbs.push(artist.name);
    } else if (currentLevel === 'album' && albumEntry) {
      crumbs.push(albumEntry.artist, albumEntry.title);
    } else if (currentLevel === 'genre' && genreName) {
      crumbs.push(genreName);
    }

    return crumbs;
  }

  /* ---------- Sort menu ---------- */

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

  /* ---------- Selection / navigation ---------- */

  function selectArtist(entry: ArtistEntry) {
    selectedGenre.set(null);
    selectedArtistId.set(entry.name);
    selectedAlbumId.set(null);
  }

  function selectAlbum(entry: AlbumEntry) {
    selectedGenre.set(null);
    selectedArtistId.set(entry.artist);
    selectedAlbumId.set(entry.key);
  }

  function selectGenre(entry: GenreEntry) {
    selectedArtistId.set(null);
    selectedAlbumId.set(null);
    selectedGenre.set(entry.name);
  }

  function selectFolderCard(card: MusicFolderCard) {
    if ($musicFolderSegments.length === 0) {
      // Entering a root card anchors the root identity; the segment trail
      // starts with the root's own base name.
      musicFolderRootPath.set(trimTrailingSeparator(card.path));
      musicFolderSegments.set([basenameOf(card.path)]);
      return;
    }
    musicFolderSegments.set([...$musicFolderSegments, card.name]);
  }

  function setBrowseMode(mode: MusicBrowseMode) {
    const modeChanged = mode !== $musicBrowseMode;
    const drilledDown =
      !!$selectedArtistId ||
      !!$selectedAlbumId ||
      !!$selectedGenre ||
      $musicFolderSegments.length > 0;

    // Re-selecting the active tab also returns to that mode's root.
    if (!modeChanged && !drilledDown) return;

    selectedArtistId.set(null);
    selectedAlbumId.set(null);
    selectedGenre.set(null);
    musicFolderRootPath.set(null);
    musicFolderSegments.set([]);
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
      return;
    }

    if (level === 'folder') {
      const segments = $musicFolderSegments;
      if (segments.length <= 1) {
        musicFolderRootPath.set(null);
        musicFolderSegments.set([]);
        return;
      }
      musicFolderSegments.set(segments.slice(0, -1));
    }
  }

  /* ---------- Shell hand-off (folder context menu "Open") ---------- */

  /**
   * Navigate the Folders tab to an absolute path (the root itself or any
   * deeper subfolder). The root identity is derived from the configured music
   * roots so duplicate-named roots stay scoped to their own subtree.
   */
  function openMusicFolderPath(path: string): void {
    const clean = trimTrailingSeparator(path);
    const root = get(settings).musicLibraryFolders.find((candidate) => isUnderRoot(clean, candidate));
    if (!root) return;

    const cleanRoot = trimTrailingSeparator(root);
    const rest = clean.slice(cleanRoot.length).replace(/^[\\/]+/, '');
    const restSegments = rest.length > 0 ? rest.split(/[\\/]+/).filter(Boolean) : [];

    musicBrowseMode.set('folders');
    selectedArtistId.set(null);
    selectedAlbumId.set(null);
    selectedGenre.set(null);
    musicFolderRootPath.set(cleanRoot);
    musicFolderSegments.set([basenameOf(cleanRoot), ...restSegments]);
  }

  onMount(() => {
    // App.svelte routes the folder context menu here after switching to the
    // Music tab; a native listener keeps the Svelte typings happy.
    function handleShellOpenFolder(event: Event): void {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== 'string' || !detail) return;
      openMusicFolderPath(detail);
    }

    window.addEventListener('vlc-open-music-folder', handleShellOpenFolder);
    return () => window.removeEventListener('vlc-open-music-folder', handleShellOpenFolder);
  });

  /* ---------- Covers ---------- */

  /** Cached cover URL for a track, warming the lazy cover cache on demand. */
  function coverFor(track: MusicTrack | null | undefined): string {
    if (!track) return '';
    ensureMusicCover(track);
    return $musicCovers.get(track.id) ?? '';
  }

  /* ---------- Playback & actions ---------- */

  function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /** Queue the given tracks with real sources, starting at the clicked row. */
  function queueTracks(tracks: MusicTrack[], index: number) {
    if (tracks.length === 0) return;

    setQueue(
      tracks.map(toPlayerTrack),
      Math.min(Math.max(0, index), tracks.length - 1),
    );
    recordMusicListen(tracks[Math.min(Math.max(0, index), tracks.length - 1)]);
    navigate('home');
  }

  /** Resolve the live row index so re-sorted lists queue the right position. */
  function queueTrack(track: MusicTrack) {
    const index = trackRows.findIndex((item) => item.id === track.id);
    if (index >= 0) queueTracks(trackRows, index);
  }

  const rowActionClass =
    'flex h-6 w-6 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60';

  function queueTrackOnly(track: MusicTrack): void {
    addToQueue(toPlayerTrack(track));
    libraryImportLog.set(`Queued ${track.title}`);
  }

  function playlistTrack(track: MusicTrack, anchor: HTMLElement | null = null): void {
    openPlaylistTarget(toPlayerTrack(track), anchor);
  }

  function dragTrack(event: DragEvent, track: MusicTrack): void {
    startTrackDrag(event, toPlayerTrack(track));
  }

  function trackContextMenu(event: MouseEvent, track: MusicTrack): void {
    openMediaContextMenu(event, track.id);
  }

  function folderContextMenu(event: MouseEvent, card: MusicFolderCard): void {
    openFolderContextMenu(event, card.path);
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
            <FuzzySearch placeholder={t('music.search_placeholder')} on:search={handleSearch} />
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
        {:else if level === 'genre' || level === 'folder'}
          <button
            type="button"
            class="mt-2 rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text {focusRing}"
            on:click={goBack}
          >
            Back
          </button>
        {/if}
      </div>
    {:else}
      {#if level === 'artist' && selectedArtistEntry}
        <div class="flex flex-col gap-4 border-b border-vlc-border px-4 py-5 sm:flex-row sm:items-center sm:px-6">
          <MusicCover emoji="🎤" src={coverFor(selectedArtistEntry.representative)} size="xl" />
          <div class="min-w-0">
            <p class="text-[11px] uppercase tracking-wide text-vlc-muted">Artist</p>
            <h1 class="truncate text-xl font-semibold text-vlc-text sm:text-2xl">{selectedArtistEntry.name}</h1>
            <p class="mt-1 text-[13px] text-vlc-secondary">
              {selectedArtistEntry.albumCount} albums • {formatDuration(selectedArtistEntry.duration)}
            </p>
          </div>
        </div>
      {:else if level === 'album' && selectedAlbumEntry}
        <div class="border-b border-vlc-border px-4 py-5 sm:px-6">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
            <MusicCover emoji="💿" src={coverFor(selectedAlbumEntry.representative)} size="xl" />
            <div class="min-w-0 flex-1">
              <p class="text-[11px] uppercase tracking-wide text-vlc-muted">Album</p>
              <h1 class="truncate text-xl font-semibold text-vlc-text sm:text-2xl">
                {selectedAlbumEntry.title}
              </h1>
              <p class="mt-1 text-[13px] text-vlc-secondary">
                {selectedAlbumEntry.artist} • {selectedAlbumEntry.year ?? '—'} • {selectedAlbumEntry.tracks.length} tracks
              </p>
              <p class="mt-0.5 text-xs text-vlc-muted">
                {selectedAlbumEntry.tracks[0]?.genre ?? UNKNOWN_GENRE} • {formatDuration(albumDuration(selectedAlbumEntry))}
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
              {selectedGenreEntry.trackCount} songs • {selectedGenreEntry.albumCount} albums • {formatDuration(selectedGenreEntry.duration)}
            </p>
          </div>
        </div>
      {/if}

      {#if folderCardsVisible}
        {#if $musicViewMode === 'grid'}
          <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#each folderCards as card (card.path)}
              <button
                type="button"
                class="group block w-full rounded-control text-left {focusRing}"
                title={`Open ${card.displayName}`}
                on:click={() => selectFolderCard(card)}
                on:contextmenu={(event) => folderContextMenu(event, card)}
              >
                <div class="relative aspect-square w-full">
                  <MusicCover
                    emoji="📁"
                    src={coverFor(card.representative)}
                    size="fill"
                    className="transition-colors group-hover:border-vlc-borderStrong"
                  />
                </div>
                <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{card.displayName}</div>
                <div class="truncate text-[11px] text-vlc-muted">{card.totalTracks} tracks</div>
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
              <span class="w-20 shrink-0 text-right">Tracks</span>
              <span class="w-20 shrink-0 text-right">Duration</span>
            </div>
            <div class="mt-1">
              {#each folderCards as card (card.path)}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised {focusRing}"
                  title={`Open ${card.displayName}`}
                  on:click={() => selectFolderCard(card)}
                  on:contextmenu={(event) => folderContextMenu(event, card)}
                >
                  <MusicCover emoji="📁" src={coverFor(card.representative)} size="sm" />
                  <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{card.displayName}</span>
                  <span class="w-20 shrink-0 text-right text-xs text-vlc-secondary">{card.totalTracks} tracks</span>
                  <span class="w-20 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(card.duration)}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="px-4 py-2 sm:px-6">
            {#each folderCards as card (card.path)}
              <button
                type="button"
                class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {focusRing}"
                title={`Open ${card.displayName}`}
                on:click={() => selectFolderCard(card)}
                on:contextmenu={(event) => folderContextMenu(event, card)}
              >
                <span class="min-w-0 flex-1 truncate text-vlc-text">{card.displayName}</span>
                <span class="w-20 shrink-0 text-right text-[11px] text-vlc-muted">{card.totalTracks} tracks</span>
                <span class="w-14 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(card.duration)}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}

      {#if level === 'artists'}
        {#if $musicViewMode === 'grid'}
          <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#each sortedArtists as artist (artist.name)}
              <button
                type="button"
                class="group block w-full rounded-control text-left {focusRing}"
                title={`Open ${artist.name}`}
                on:click={() => selectArtist(artist)}
              >
                <div class="relative aspect-square w-full">
                  <MusicCover
                    emoji="🎤"
                    src={coverFor(artist.representative)}
                    size="fill"
                    className="transition-colors group-hover:border-vlc-borderStrong"
                  />
                </div>
                <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{artist.name}</div>
                <div class="truncate text-[11px] text-vlc-muted">
                  {artist.albumCount} albums • {artist.trackCount} tracks
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
              {#each sortedArtists as artist (artist.name)}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised {focusRing}"
                  title={`Open ${artist.name}`}
                  on:click={() => selectArtist(artist)}
                >
                  <MusicCover emoji="🎤" src={coverFor(artist.representative)} size="sm" />
                  <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{artist.name}</span>
                  <span class="w-20 shrink-0 text-right text-xs text-vlc-secondary">{artist.albumCount} albums</span>
                  <span class="w-20 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(artist.duration)}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="px-4 py-2 sm:px-6">
            {#each sortedArtists as artist (artist.name)}
              <button
                type="button"
                class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {focusRing}"
                title={`Open ${artist.name}`}
                on:click={() => selectArtist(artist)}
              >
                <span class="min-w-0 flex-1 truncate text-vlc-text">{artist.name}</span>
                <span class="w-20 shrink-0 text-right text-[11px] text-vlc-muted">{artist.albumCount} albums</span>
                <span class="w-14 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(artist.duration)}</span>
              </button>
            {/each}
          </div>
        {/if}
      {:else if level === 'albums' || level === 'artist'}
        {#if $musicViewMode === 'grid'}
          <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#each albumRows as entry (entry.key)}
              <button
                type="button"
                class="group block w-full rounded-control text-left {focusRing}"
                title={`Open ${entry.title}`}
                on:click={() => selectAlbum(entry)}
              >
                <div class="relative aspect-square w-full">
                  <MusicCover
                    emoji="💿"
                    src={coverFor(entry.representative)}
                    size="fill"
                    className="transition-colors group-hover:border-vlc-borderStrong"
                  />
                </div>
                <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{entry.title}</div>
                <div class="truncate text-[11px] text-vlc-muted">
                  {#if showAlbumArtistColumn}{entry.artist} • {/if}{entry.year ?? '—'} • {entry.tracks.length} tracks
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
              {#each albumRows as entry (entry.key)}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised {focusRing}"
                  title={`Open ${entry.title}`}
                  on:click={() => selectAlbum(entry)}
                >
                  <MusicCover emoji="💿" src={coverFor(entry.representative)} size="sm" />
                  <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{entry.title}</span>
                  {#if showAlbumArtistColumn}
                    <span class="w-36 shrink-0 truncate text-xs text-vlc-secondary">{entry.artist}</span>
                  {/if}
                  <span class="w-12 shrink-0 text-right text-xs text-vlc-muted">{entry.year ?? '—'}</span>
                  <span class="w-16 shrink-0 text-right text-xs text-vlc-muted">{entry.tracks.length} tracks</span>
                  <span class="w-14 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(albumDuration(entry))}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="px-4 py-2 sm:px-6">
            {#each albumRows as entry (entry.key)}
              <button
                type="button"
                class="flex h-8 w-full items-center gap-3 rounded-input border-b border-vlc-border/40 px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-vlc-raised {focusRing}"
                title={`Open ${entry.title}`}
                on:click={() => selectAlbum(entry)}
              >
                <span class="min-w-0 flex-1 truncate text-vlc-text">{entry.title}</span>
                {#if showAlbumArtistColumn}
                  <span class="hidden w-36 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block">{entry.artist}</span>
                {/if}
                <span class="w-10 shrink-0 text-right text-[11px] text-vlc-muted">{entry.year ?? '—'}</span>
                <span class="w-16 shrink-0 text-right text-[11px] text-vlc-muted">{entry.tracks.length} tracks</span>
                <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(albumDuration(entry))}</span>
              </button>
            {/each}
          </div>
        {/if}
      {:else if level === 'genres'}
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
                  <span class="w-16 shrink-0 text-right text-xs text-vlc-muted">{formatDuration(genre.duration)}</span>
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
                <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(genre.duration)}</span>
              </button>
            {/each}
          </div>
        {/if}
      {:else if showTrackBlock}
        {#if $musicViewMode === 'grid'}
          <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-4 sm:p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#each trackRows as entry, i (entry.id)}
              {@const position = level === 'album' ? entry.trackNumber ?? i + 1 : i + 1}
              <div
                class="group relative"
                role="group"
                aria-label={`${entry.title} actions`}
                draggable="true"
                on:dragstart={(event) => dragTrack(event, entry)}
                on:contextmenu={(event) => trackContextMenu(event, entry)}
              >
                <button
                  type="button"
                  class="block w-full rounded-control text-left {focusRing}"
                  title={`Play ${entry.title}. Drag to add to the queue.`}
                  on:click={() => queueTrack(entry)}
                >
                  <div class="relative aspect-square w-full">
                    <MusicCover
                      emoji={level === 'album' ? '💿' : '🎵'}
                      src={coverFor(entry)}
                      size="fill"
                      className="transition-colors group-hover:border-vlc-borderStrong"
                    />
                    <span class="absolute left-2 top-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] text-vlc-secondary">
                      {position}
                    </span>
                    <span class="absolute bottom-2 right-2 rounded bg-vlc-app/80 px-1.5 py-0.5 text-[10px] text-vlc-secondary">
                      {formatDuration(entry.durationSeconds)}
                    </span>
                  </div>
                  <div class="mt-2.5 truncate text-[12px] leading-4 text-vlc-text">{entry.title}</div>
                  <div class="truncate text-[11px] text-vlc-muted">
                    {artistNameOf(entry)}{#if showAlbumColumns} • {entry.album}{/if}
                  </div>
                </button>

                <div
                  class="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-control bg-vlc-panel/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <button
                    type="button"
                    class={rowActionClass}
                    title="Add to queue"
                    aria-label={`Add ${entry.title} to the queue`}
                    on:click={() => queueTrackOnly(entry)}
                  >
                    <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class={rowActionClass}
                    title="Add to playlist"
                    aria-label={`Add ${entry.title} to a playlist`}
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
            {#each trackRows as entry, i (entry.id)}
              {@const position = level === 'album' ? entry.trackNumber ?? i + 1 : i + 1}
              <div
                class="group relative"
                role="group"
                aria-label={`${entry.title} actions`}
                draggable="true"
                on:dragstart={(event) => dragTrack(event, entry)}
                on:contextmenu={(event) => trackContextMenu(event, entry)}
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-control px-4 py-2 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-raised {focusRing} sm:px-6"
                  title={`Play ${entry.title}. Drag to add to the queue.`}
                  on:click={() => queueTrack(entry)}
                >
                  <span class="w-7 shrink-0 text-vlc-muted">{position}</span>
                  <span class="min-w-0 flex-1 truncate text-vlc-text">{entry.title}</span>
                  <span class="w-32 shrink-0 truncate">{artistNameOf(entry)}</span>
                  {#if showAlbumColumns}
                    <span class="hidden w-40 shrink-0 truncate lg:block">{entry.album}</span>
                  {/if}
                  {#if showAlbumColumns}
                    <span class="w-12 shrink-0 text-right text-vlc-muted">{entry.year ?? ''}</span>
                  {/if}
                  <span class="w-12 shrink-0 text-right text-vlc-muted">{formatDuration(entry.durationSeconds)}</span>
                </button>

                <div
                  class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-control bg-vlc-panel/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <button
                    type="button"
                    class={rowActionClass}
                    title="Add to queue"
                    aria-label={`Add ${entry.title} to the queue`}
                    on:click={() => queueTrackOnly(entry)}
                  >
                    <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class={rowActionClass}
                    title="Add to playlist"
                    aria-label={`Add ${entry.title} to a playlist`}
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
            {#each trackRows as entry, i (entry.id)}
              {@const position = level === 'album' ? entry.trackNumber ?? i + 1 : i + 1}
              <div
                class="group relative border-b border-vlc-border/40 last:border-b-0"
                role="group"
                aria-label={`${entry.title} actions`}
                draggable="true"
                on:dragstart={(event) => dragTrack(event, entry)}
                on:contextmenu={(event) => trackContextMenu(event, entry)}
              >
                <button
                  type="button"
                  class="flex h-8 w-full items-center gap-3 rounded-input px-2 text-left text-xs transition-colors hover:bg-vlc-raised {focusRing}"
                  title={`Play ${entry.title}. Drag to add to the queue.`}
                  on:click={() => queueTrack(entry)}
                >
                  <span class="w-6 shrink-0 text-right text-[11px] text-vlc-muted">{position}</span>
                  <span class="min-w-0 flex-1 truncate text-vlc-text">{entry.title}</span>
                  <span class="hidden w-32 shrink-0 truncate text-right text-[11px] text-vlc-muted sm:block">{artistNameOf(entry)}</span>
                  {#if showAlbumColumns}
                    <span class="hidden w-40 shrink-0 truncate text-right text-[11px] text-vlc-muted lg:block">{entry.album}</span>
                  {/if}
                  <span class="w-12 shrink-0 text-right text-[11px] text-vlc-muted">{formatDuration(entry.durationSeconds)}</span>
                </button>

                <div
                  class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-control bg-vlc-panel/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <button
                    type="button"
                    class={rowActionClass}
                    title="Add to queue"
                    aria-label={`Add ${entry.title} to the queue`}
                    on:click={() => queueTrackOnly(entry)}
                  >
                    <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class={rowActionClass}
                    title="Add to playlist"
                    aria-label={`Add ${entry.title} to a playlist`}
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
      {/if}
    {/if}
  </div>
</div>
