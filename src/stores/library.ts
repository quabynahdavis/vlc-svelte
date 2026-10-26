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

