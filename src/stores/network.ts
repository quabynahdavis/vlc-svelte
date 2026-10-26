import { writable } from 'svelte/store';

export const networkSelectedCategory = writable<string>('Local Network');
export const networkPath = writable<string[]>([]);
export const networkSearch = writable('');
export const networkViewSubPath = writable<string | null>(null);
