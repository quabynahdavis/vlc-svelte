import { writable } from 'svelte/store';

export const musicBreadcrumb = writable<string[]>(['Videos', 'Music']);
export const selectedArtistId = writable<string | null>(null);
export const selectedAlbumId = writable<string | null>(null);
export const musicSearch = writable('');
export const musicViewMode = writable<'grid' | 'list'>('grid');
/** Sort columns shared by the artists, albums and tracks levels. */
export type MusicSortKey = 'title' | 'artist' | 'album' | 'duration' | 'year';
export type SortDirection = 'asc' | 'desc';

export const musicSort = writable<MusicSortKey>('title');
export const musicSortDirection = writable<SortDirection>('asc');
