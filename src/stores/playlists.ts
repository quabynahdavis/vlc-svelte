import { writable } from 'svelte/store';

export const playlistsSelectedId = writable<string | null>(null);
export const playlistsSearch = writable('');
export const playlistsSort = writable<'manual' | 'title' | 'artist' | 'date'>('manual');
