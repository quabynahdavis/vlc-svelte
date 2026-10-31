import { writable } from 'svelte/store';

export const musicBreadcrumb = writable<string[]>(['Music', 'Artists']);
export const selectedArtistId = writable<string | null>(null);
export const selectedAlbumId = writable<string | null>(null);
export const selectedGenre = writable<string | null>(null);
export const musicSearch = writable('');

/** Top-level browse levels available in the Music view. */
export type MusicBrowseMode = 'songs' | 'albums' | 'artists' | 'genres';

/** Artists is the default so the existing artist-first browsing is preserved. */
export const musicBrowseMode = writable<MusicBrowseMode>('artists');

/** Sort columns shared by the artists, albums and tracks levels. */
export type MusicSortKey = 'title' | 'artist' | 'album' | 'duration' | 'year';
export type SortDirection = 'asc' | 'desc';

export const musicSort = writable<MusicSortKey>('title');
export const musicSortDirection = writable<SortDirection>('asc');
