
  const collator = new Intl.Collator(undefined, {
    sensitivity: "base",
    numeric: true,
  });
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app";

  const browseModes: Array<{ id: MusicBrowseMode; label: string }> = [
    { id: "artists", label: t("music.tabs.artists") },
    { id: "albums", label: t("music.tabs.albums") },
    { id: "songs", label: t("music.tabs.songs") },
    { id: "genres", label: t("music.tabs.genres") },
    { id: "folders", label: t("music.tabs.folders") },
  ];

  /* ---------- Small path helpers (mirror the library navigation patterns) ---------- */

  function trimTrailingSeparator(path: string): string {
    return path.replace(/[\\/]+$/, "");
  }

  function basenameOf(path: string): string {
    const parts = trimTrailingSeparator(path)
      .split(/[\\/]+/)
      .filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }

  /** Parent folder segment of a path, used for `Name[ParentName]` disambiguation. */
  function parentSegmentOf(path: string): string {
    const parts = trimTrailingSeparator(path)
      .split(/[\\/]+/)
      .filter(Boolean);
    return parts[parts.length - 2] ?? "";
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
      (segment, index) =>
        segment.toLowerCase() === (parts[index] ?? "").toLowerCase(),
    );
  }

  /* ---------- View-model builders (side effect: warm the cover cache) ---------- */

  function representativeOf(tracks: MusicTrack[]): MusicTrack | null {
    const representative =
      tracks.find((track) => track.hasCover) ?? tracks[0] ?? null;
    if (representative) ensureMusicCover(representative);
    return representative;
  }

  function buildArtistEntries(tracks: MusicTrack[]): ArtistEntry[] {
    const groups = new Map<
      string,
      { name: string; albums: Set<string>; tracks: MusicTrack[] }
    >();

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
        duration: group.tracks.reduce(
          (total, track) => total + track.durationSeconds,
          0,
        ),
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
        group = {
          key,
          artist,
          title: track.album,
          year: track.year,
          tracks: [],
          representative: null,
        };
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
    const groups = new Map<
      string,
      {
        name: string;
        albums: Set<string>;
        trackCount: number;
        duration: number;
      }
    >();

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
  function buildFolderRootCards(
    roots: string[],
    tracks: MusicTrack[],
  ): MusicFolderCard[] {
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
      const direct = inside.filter(
        (track) => relativePartsUnder(track.path, clean).length === 1,
      );

      cards.push({
        name,
        displayName: ambiguous ? `${name}[${parentSegmentOf(clean)}]` : name,
        path: root,
        directCount: direct.length,
        totalTracks: inside.length,
        duration: inside.reduce(
          (total, track) => total + track.durationSeconds,
          0,
        ),
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
      if (parts.length <= chain.length + 1 || !chainMatches(parts, chain))
        continue;
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
        (track) =>
          relativePartsUnder(track.path, cleanRoot).length === chain.length + 2,
      );
      return {
        name,
        displayName: name,
        path: [cleanRoot, ...chain, name].join("/"),
        directCount: direct.length,
        totalTracks: inside.length,
        duration: inside.reduce(
          (total, track) => total + track.durationSeconds,
          0,
        ),
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

  let query = "";
  let searchKey = 0;

  function handleSearch(event: CustomEvent<string>) {
    query = event.detail;
  }

  function clearSearch() {
    query = "";
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
    if (mode === "artists") {
      if (albumId) return "album";
      if (artistId) return "artist";
      return "artists";
    }
    if (mode === "albums") return albumId ? "album" : "albums";
    if (mode === "genres") return genreName ? "genre" : "genres";
    if (mode === "folders")
      return folderSegments.length > 0 ? "folder" : "folders";
    return "songs";
  }

  function getSortOptions(level: BrowseLevel): SortOption[] {
    switch (level) {
      case "songs":
      case "genre":
      case "folder":
        return [
          { key: "title", label: "Title" },
          { key: "artist", label: "Artist" },
          { key: "album", label: "Album" },
          { key: "year", label: "Year" },
          { key: "duration", label: "Duration" },
        ];
      case "album":
        return [
          { key: "title", label: "Title" },
          { key: "artist", label: "Artist" },
          { key: "duration", label: "Duration" },
        ];
      case "artist":
        return [
          { key: "title", label: "Title" },
          { key: "year", label: "Year" },
          { key: "duration", label: "Duration" },
        ];
      case "albums":
        return [
          { key: "title", label: "Title" },
          { key: "artist", label: "Artist" },
          { key: "year", label: "Year" },
          { key: "duration", label: "Duration" },
        ];
      case "artists":
        return [
          { key: "title", label: "Name" },
          { key: "album", label: "Albums" },
          { key: "duration", label: "Duration" },
        ];
      case "genres":
        return [
          { key: "title", label: "Genre" },
          { key: "album", label: "Songs" },
          { key: "duration", label: "Duration" },
        ];
      case "folders":
        return [
          { key: "title", label: "Name" },
          { key: "album", label: "Tracks" },
          { key: "duration", label: "Duration" },
        ];
    }
  }

  /* ---------- Comparators ---------- */

  function artistNameOf(track: MusicTrack): string {
    return track.albumArtist || track.artist || UNKNOWN_ARTIST;
  }

  function albumDuration(entry: AlbumEntry): number {
    return entry.tracks.reduce(
      (total, track) => total + track.durationSeconds,
      0,
    );
  }

  /** Ascending puts unknown years last; the direction flip then keeps them last. */
  function compareYear(a: number | null, b: number | null): number {
    if ((a ?? null) === (b ?? null)) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  }

  function compareArtists(
    a: ArtistEntry,
    b: ArtistEntry,
    key: MusicSortKey,
  ): number {
    switch (key) {
      case "album":
        return a.albumCount - b.albumCount;
      case "duration":
        return a.duration - b.duration;
      default:
        return collator.compare(a.name, b.name);
    }
  }

  function compareAlbums(
    a: AlbumEntry,
    b: AlbumEntry,
    key: MusicSortKey,
  ): number {
    switch (key) {
      case "artist":
        return (
          collator.compare(a.artist, b.artist) ||
          collator.compare(a.title, b.title)
        );
      case "year":
        return compareYear(a.year, b.year);
      case "duration":
        return albumDuration(a) - albumDuration(b);
      default:
        return (
          collator.compare(a.title, b.title) ||
          collator.compare(a.artist, b.artist)
        );
    }
  }

  function compareTracks(
    a: MusicTrack,
    b: MusicTrack,
    key: MusicSortKey,
  ): number {
    switch (key) {
      case "artist":
        return (
          collator.compare(artistNameOf(a), artistNameOf(b)) ||
          collator.compare(a.title, b.title)
        );
      case "album":
        return collator.compare(a.album, b.album) || compareAlbumOrder(a, b);
      case "year":
        return compareYear(a.year, b.year);
      case "duration":
        return a.durationSeconds - b.durationSeconds;
      default:
        return collator.compare(a.title, b.title);
    }
  }

  function compareGenres(
    a: GenreEntry,
    b: GenreEntry,
    key: MusicSortKey,
  ): number {
    switch (key) {
      case "album":
        return a.trackCount - b.trackCount;
      case "duration":
        return a.duration - b.duration;
      default:
        return collator.compare(a.name, b.name);
    }
  }

  function compareFolders(
    a: MusicFolderCard,
    b: MusicFolderCard,
    key: MusicSortKey,
  ): number {
    switch (key) {
      case "album":
        return a.totalTracks - b.totalTracks;
      case "duration":
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
    const sign = direction === "asc" ? 1 : -1;

    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const result = compare(a.item, b.item);
        if (result === 0) return a.index - b.index;
        return result * sign;
      })
      .map(({ item }) => item);
  }
