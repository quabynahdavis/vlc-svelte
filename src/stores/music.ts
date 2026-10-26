import { writable } from 'svelte/store';

export const musicBreadcrumb = writable<string[]>(['Videos', 'Music']);
export const selectedArtistId = writable<string | null>(null);
export const selectedAlbumId = writable<string | null>(null);
export const musicSearch = writable('');
export const musicViewMode = writable<'grid' | 'list'>('grid');
export const musicSort = writable<'name' | 'year'>('name');
