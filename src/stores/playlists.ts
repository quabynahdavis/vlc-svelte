import { writable } from 'svelte/store';

export const playlistsSelectedId = writable<string | null>(null);
export const playlistsSearch = writable('');
/** Playlist list ordering. `manual` keeps the source order. */
export type PlaylistsSortKey = 'manual' | 'name' | 'date' | 'count';
export type SortDirection = 'asc' | 'desc';

export const playlistsSort = writable<PlaylistsSortKey>('manual');
export const playlistsSortDirection = writable<SortDirection>('asc');
