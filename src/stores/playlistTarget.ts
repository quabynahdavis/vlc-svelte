import { writable } from 'svelte/store';
import type { Track } from './player';

export interface PlaylistTargetState {
  open: boolean;
  track: Track | null;
  /** Element that requested the dialog, used to restore focus on close. */
  anchor: HTMLElement | null;
}

const initialState: PlaylistTargetState = {
  open: false,
  track: null,
  anchor: null,
};

/** Global "add this track to a playlist" dialog state. */
export const playlistTarget = writable<PlaylistTargetState>(initialState);

export function openPlaylistTarget(track: Track, anchor: HTMLElement | null = null): void {
  playlistTarget.set({ open: true, track, anchor });
}

export function closePlaylistTarget(): void {
  playlistTarget.set(initialState);
}
