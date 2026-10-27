import { derived, writable } from 'svelte/store';

export type RepeatMode = 'off' | 'all' | 'one';

export type Track = {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  src?: string;
};

export type PlayerState = {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
};

const initialState: PlayerState = {
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 80,
  muted: false,
  repeat: 'off',
  shuffle: false,
};

export const player = writable<PlayerState>(initialState);

export const currentTrack = derived(player, ($player) =>
  $player.currentIndex >= 0 ? ($player.queue[$player.currentIndex] ?? null) : null,
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shuffledIndex(length: number, currentIndex: number): number {
  if (length <= 1) return 0;

  let index = Math.floor(Math.random() * length);
  if (index === currentIndex) index = (index + 1) % length;
  return index;
}

function playableState(state: PlayerState, index: number): PlayerState {
  const track = state.queue[index];
  if (!track) return state;

  return {
    ...state,
    currentIndex: index,
    currentTime: 0,
    duration: track.duration > 0 ? track.duration : 0,
    isPlaying: true,
  };
}

/** Start playback at a specific queue position. */
export function playAt(index: number): void {
  player.update((state) => {
    if (index < 0 || index >= state.queue.length) return state;
    return playableState(state, index);
  });
}

/**
 * Replace the queue and start at the requested item.
 * Resets elapsed time and derives the duration from the selected track.
 */
export function setQueue(tracks: Track[], startIndex = 0): void {
  player.update((state) => {
    if (tracks.length === 0) {
      return {
        ...state,
        queue: [],
        currentIndex: -1,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      };
    }

    const requested = Number.isFinite(startIndex) ? Math.trunc(startIndex) : 0;
    const index = clamp(requested, 0, tracks.length - 1);
    const track = tracks[index];

    return {
      ...state,
      queue: tracks,
      currentIndex: index,
      currentTime: 0,
      duration: Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0,
      isPlaying: true,
    };
  });
}

/** Stop playback and rewind, keeping the queue and loaded track intact. */
export function stop(): void {
  player.update((state) => ({ ...state, isPlaying: false, currentTime: 0 }));
}

/** Advance to the next queue item, respecting repeat and shuffle. */
export function next(): void {
  player.update((state) => {
    if (state.queue.length === 0) return state;

    if (state.shuffle) {
      return playableState(state, shuffledIndex(state.queue.length, state.currentIndex));
    }

    const nextIndex = state.currentIndex < 0 ? 0 : state.currentIndex + 1;

    if (nextIndex >= state.queue.length) {
      if (state.repeat === 'all') return playableState(state, 0);
      return { ...state, isPlaying: false };
    }

    return playableState(state, nextIndex);
  });
}

/** Move to the previous queue item, wrapping when repeat is enabled. */
export function prev(): void {
  player.update((state) => {
    if (state.queue.length === 0) return state;

    if (state.shuffle) {
      return playableState(state, shuffledIndex(state.queue.length, state.currentIndex));
    }

    const previousIndex = state.currentIndex - 1;

    if (previousIndex >= 0) return playableState(state, previousIndex);
    if (state.repeat === 'all') return playableState(state, state.queue.length - 1);
    if (state.currentIndex < 0) return playableState(state, 0);

    // Restart the first item instead of dead-ending the transport.
    return { ...state, currentTime: 0, isPlaying: true };
  });
}

/** Toggle play/pause. The view syncs this to the media element. */
export function toggle(): void {
  player.update((state) => ({ ...state, isPlaying: !state.isPlaying }));
}

/** Seek within the current item, clamped to its duration. */
export function seek(time: number): void {
  player.update((state) => {
    const upperBound = state.duration > 0 ? state.duration : Number.POSITIVE_INFINITY;
    return { ...state, currentTime: clamp(Number.isFinite(time) ? time : 0, 0, upperBound) };
  });
}

/** Set volume from 0 to 100. Raising volume out of zero unmutes. */
export function setVolume(volume: number): void {
  player.update((state) => {
    const value = Math.round(clamp(Number.isFinite(volume) ? volume : 0, 0, 100));
    return { ...state, volume: value, muted: value === 0 };
  });
}

/** Toggle the mute flag without losing the previous volume level. */
export function toggleMute(): void {
  player.update((state) => ({ ...state, muted: !state.muted }));
}
