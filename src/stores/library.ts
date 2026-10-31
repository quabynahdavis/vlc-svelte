import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { showsBreadcrumb, showsItems, type MediaItem } from '../lib/mock';

/** Breadcrumb trail for the current folder. Future phases can replace this per folder. */
export const breadcrumb: Writable<string[]> = writable([...showsBreadcrumb]);

/** Items in the current folder. Future phases can swap this when opening a folder. */
export const libraryItems: Writable<MediaItem[]> = writable([...showsItems]);

/** Raw search box contents, shared so later phases can layer on other filters. */
export const searchQuery: Writable<string> = writable('');

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
