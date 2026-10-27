import { writable } from 'svelte/store';
import type { NavId } from '../lib/constants';

/** Top-level section currently rendered by the shell. */
export const activeNav = writable<NavId>('home');

/** Switch the shell to another top-level section. */
export function navigate(id: NavId): void {
  activeNav.set(id);
}
