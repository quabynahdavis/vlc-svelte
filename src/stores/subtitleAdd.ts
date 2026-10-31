/**
 * Subtitle addition flow.
 *
 * Provides a simple modal for adding subtitle files to the current track,
 * a folder, or a playlist. The actual subtitle renderer is not implemented
 * in this build, so this store only tracks the intent to add.
 *
 * Mode: 'file' | 'folder' | 'playlist'
 */
import { writable, type Writable } from 'svelte/store';
import type { Track } from './player';

interface SubtitleAddState {
  open: boolean;
  mode: 'file' | 'folder' | 'playlist';
  track: Track | null;
  /** The element that triggered the dialog; restored on close. */
  anchor: HTMLElement | null;
}

const initialState: SubtitleAddState = {
  open: false,
  mode: 'file',
  track: null,
  anchor: null,
};

export const subtitleAdd: Writable<SubtitleAddState> = writable(initialState);

export function openSubtitleAdd(
  mode: 'file' | 'folder' | 'playlist',
  track: Track | null = null,
  anchor: HTMLElement | null = null
): void {
  subtitleAdd.set({ open: true, mode, track, anchor });
}

export function closeSubtitleAdd(): void {
  subtitleAdd.set({ ...initialState });
}