import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { showsBreadcrumb, showsItems, type MediaItem } from '../lib/mock';

/** Breadcrumb trail for the current folder. Future phases can replace this per folder. */
export const breadcrumb: Writable<string[]> = writable([...showsBreadcrumb]);

/** Items in the current folder. Future phases can swap this when opening a folder. */
export const libraryItems: Writable<MediaItem[]> = writable([...showsItems]);

/** Raw search box contents, shared so later phases can layer on other filters. */
export const searchQuery: Writable<string> = writable('');

/** Import log placeholder for UI debugging. */
export const libraryImportLog: Writable<string> = writable('');

/** Case-insensitive title filter used by the library grid and toolbar count. */
export const filteredItems: Readable<MediaItem[]> = derived(
  [libraryItems, searchQuery],
  ([$libraryItems, $searchQuery]) => {
    const query = $searchQuery.trim().toLowerCase();
    if (!query) return $libraryItems;

    return $libraryItems.filter((item) => item.title.toLowerCase().includes(query));
  },
);

/** Columns offered by the library sort menu. */
export type LibrarySortKey = 'title' | 'duration' | 'progress' | 'episode';
export type SortDirection = 'asc' | 'desc';

export const librarySortKey: Writable<LibrarySortKey> = writable('episode');
export const librarySortDirection: Writable<SortDirection> = writable('asc');

const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * `filteredItems` reordered by the active sort key.
 *
 * Ties fall back to the original position so the order is stable in both
 * directions, and text comparisons ignore case.
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
        }

        if (comparison === 0) return a.index - b.index;
        return comparison * direction;
      })
      .map(({ item }) => item);
  },
);

