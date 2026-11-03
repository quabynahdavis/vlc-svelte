import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { showsBreadcrumb, showsItems, type MediaItem } from '../lib/mock';

/** Breadcrumb trail for the current folder. Future phases can replace this per folder. */
export const breadcrumb: Writable<string[]> = writable([...showsBreadcrumb]);

/** Items in the current folder. Future phases can swap this when opening a folder. */
export const libraryItems: Writable<MediaItem[]> = writable([...showsItems]);

/** Raw search box contents, shared so later phases can layer on other filters. */
export const searchQuery: Writable<string> = writable('');

/* ---------- Address bar ---------- */

/**
 * Canonical folder trail exposed by the mock library. The editable address bar
 * resolves typed paths against this list, so navigation stays inside the mock
 * hierarchy and returns the canonical casing for each segment.
 */
export const libraryPath: readonly string[] = Object.freeze([...showsBreadcrumb]);

/** Folder shown when the address bar is submitted empty. */
export const libraryRoot = libraryPath[0] ?? 'Videos';

export type LibraryPathResolution =
  | { ok: true; segments: string[] }
  | { ok: false; segment: string };

/**
 * Resolve a `/`-separated path typed into the library address bar.
 *
 * Segments are trimmed and empty segments are ignored, so `Videos / Shows` and
 * `videos//shows` resolve to the same folder. Matching is case-insensitive and
 * the canonical casing from the mock hierarchy is returned. Empty input resolves
 * to the root folder. The whole path must exist; the first unknown segment is
 * reported so the caller can show an error without navigating.
 */
export function resolveLibraryPath(input: string): LibraryPathResolution {
  const requested = input
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (requested.length === 0) return { ok: true, segments: [libraryRoot] };

  const segments: string[] = [];

  for (let index = 0; index < requested.length; index += 1) {
    const canonical = libraryPath[index];

    if (!canonical || canonical.toLowerCase() !== requested[index].toLowerCase()) {
      return { ok: false, segment: requested[index] };
    }

    segments.push(canonical);
  }

  return { ok: true, segments };
}

/**
 * Navigate the breadcrumb to a typed path. Returns the resolution so callers
 * can render an error state; the breadcrumb only changes on success.
 */
export function navigateToLibraryPath(input: string): LibraryPathResolution {
  const result = resolveLibraryPath(input);
  if (result.ok) breadcrumb.set(result.segments);
  return result;
}

/** Latest human-readable import status shown under the toolbar. */
export const libraryImportLog: Writable<string> = writable('');

/**
 * Watched-state filter.
 *
 * An item counts as watched as soon as playback progress is above zero, which
 * matches when the cards and rows start drawing their progress bar. There is no
 * separate "finished" threshold, so a partly watched item is still watched.
 */
export type LibraryWatchFilter = 'all' | 'unwatched' | 'watched';

export const libraryWatchFilter: Writable<LibraryWatchFilter> = writable('all');

/** True when an item has any playback progress. Shared by filtering and sorting. */
export function isItemWatched(item: MediaItem): boolean {
  return item.progress > 0;
}

/**
 * Flip an item's watched state using the same progress-based definition as
 * {@link isItemWatched}: watched items drop back to zero progress, unwatched
 * items are marked as fully watched. Unknown ids are ignored.
 */
export function toggleItemWatched(id: string): void {
  libraryItems.update((items) =>
    items.map((item) =>
      item.id === id ? { ...item, progress: isItemWatched(item) ? 0 : 1 } : item,
    ),
  );
}

/**
 * Case-insensitive title filter plus the watched-state filter, used by the
 * library grid, the toolbar count and the empty states.
 */
export const filteredItems: Readable<MediaItem[]> = derived(
  [libraryItems, searchQuery, libraryWatchFilter],
  ([$libraryItems, $searchQuery, $watchFilter]) => {
    const query = $searchQuery.trim().toLowerCase();

    return $libraryItems.filter((item) => {
      if (query && !item.title.toLowerCase().includes(query)) return false;
      if ($watchFilter === 'unwatched') return !isItemWatched(item);
      if ($watchFilter === 'watched') return isItemWatched(item);
      return true;
    });
  },
);

/** Columns offered by the library sort menu. */
export type LibrarySortKey = 'title' | 'duration' | 'progress' | 'episode' | 'watched';
export type SortDirection = 'asc' | 'desc';

export const librarySortKey: Writable<LibrarySortKey> = writable('episode');
export const librarySortDirection: Writable<SortDirection> = writable('asc');

const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * `filteredItems` reordered by the active sort key.
 *
 * Ties fall back to the original position so the order is stable in both
 * directions, and text comparisons ignore case. For the `watched` key,
 * ascending puts unwatched items first and descending puts watched items first.
 */
export const sortedItems: Readable<MediaItem[]> = derived(
  [filteredItems, librarySortKey, librarySortDirection],
  ([$filteredItems, $sortKey, $sortDirection]) => {
    const direction = $sortDirection === 'asc' ? 1 : -1;

    return $filteredItems
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        let comparison = 0;

        switch ($sortKey) {
          case 'title':
            comparison = titleCollator.compare(a.item.title, b.item.title);
            break;
          case 'duration':
            comparison = a.item.durationSeconds - b.item.durationSeconds;
            break;
          case 'progress':
            comparison = a.item.progress - b.item.progress;
            break;
          case 'episode':
            comparison = a.item.episode - b.item.episode;
            break;
          case 'watched':
            comparison = Number(isItemWatched(a.item)) - Number(isItemWatched(b.item));
            break;
        }

        if (comparison === 0) return a.index - b.index;
        return comparison * direction;
      })
      .map(({ item }) => item);
  },
);

/* ---------- Imports ---------- */

/**
 * Item shape accepted by {@link addImportedItems}. Season and episode are
 * assigned by the store so every import lands after the existing items.
 */
export type LibraryImportEntry = Pick<
  MediaItem,
  'id' | 'title' | 'durationSeconds' | 'progress' | 'src' | 'thumbnailPath'
>;

let importSequence = 0;

/** Stable unique id for imported media, with a counter fallback without crypto.randomUUID. */
export function createLibraryItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `import-${crypto.randomUUID()}`;
  }

  importSequence += 1;
  return `import-${Date.now().toString(36)}-${importSequence}`;
}

/** Append imported items, assigning `season: 1` and the next free episode numbers. */
export function addImportedItems(entries: LibraryImportEntry[]): number {
  if (entries.length === 0) return 0;

  libraryItems.update((items) => {
    let nextEpisode = items.reduce((highest, item) => Math.max(highest, item.episode), 0) + 1;

    const additions = entries.map<MediaItem>((entry) => ({
      ...entry,
      season: 1,
      episode: nextEpisode++,
    }));

    return [...items, ...additions];
  });

  return entries.length;
}

/** Apply a duration discovered by the metadata probe; ignores items that no longer exist. */
export function updateLibraryItemDuration(id: string, durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

  libraryItems.update((items) =>
    items.map((item) =>
      item.id === id ? { ...item, durationSeconds: Math.round(durationSeconds) } : item,
    ),
  );
}
