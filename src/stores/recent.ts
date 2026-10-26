import { writable } from 'svelte/store';

export const recentActiveTab = writable<'media' | 'devices' | 'network'>('media');
export const recentSearch = writable('');
export const recentFilterType = writable<null | 'media' | 'device' | 'network'>(null);
