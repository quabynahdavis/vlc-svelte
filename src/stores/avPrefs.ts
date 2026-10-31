/**
 * Shared audio/video preferences for the right dock.
 *
 * Everything lives in one versioned JSON object under `vlc.av.prefs.v1`.
 * Persisted data is treated as untrusted: every field is checked against the
 * supported option ids and falls back to its default when malformed. Storage
 * access is wrapped so private mode, disabled storage, or SSR degrades to the
 * in-memory defaults.
 */
import { writable, type Writable } from 'svelte/store';

/** Bump the version suffix when the persisted shape changes. */
export const AV_PREFS_STORAGE_KEY = 'vlc.av.prefs.v1';

export type AudioTrackId = 'audio-1' | 'audio-2' | 'audio-3';
export type OutputDeviceId =
  | 'system-default'
  | 'built-in-speakers'
  | 'hdmi-display'
  | 'bluetooth-headphones'
  | 'usb-audio';
export type VideoFilterId = 'original' | 'warm' | 'cool' | 'mono' | 'vivid' | 'cinema';

export interface AudioTrackOption {
  id: AudioTrackId;
  label: string;
}

export interface OutputDeviceOption {
  id: OutputDeviceId;
  label: string;
}

export interface VideoFilterOption {
  id: VideoFilterId;
  label: string;
  /** CSS gradient used for the preview thumbnail itself. */
  gradient: string;
  /** CSS filter applied to the preview thumbnail itself. */
  filter: string;
}

export interface AvPrefs {
  audioTrack: AudioTrackId;
  outputDevice: OutputDeviceId;
  videoFilter: VideoFilterId;
}

export const AUDIO_TRACK_OPTIONS: readonly AudioTrackOption[] = [
  { id: 'audio-1', label: 'Audio 1 — English' },
  { id: 'audio-2', label: 'Audio 2 — Commentary' },
  { id: 'audio-3', label: 'Audio 3 — Descriptive' },
];

export const OUTPUT_DEVICE_OPTIONS: readonly OutputDeviceOption[] = [
  { id: 'system-default', label: 'System Default' },
  { id: 'built-in-speakers', label: 'Built-in Speakers' },
  { id: 'hdmi-display', label: 'HDMI / Display' },
  { id: 'bluetooth-headphones', label: 'Bluetooth Headphones' },
  { id: 'usb-audio', label: 'USB Audio' },
];

export const VIDEO_FILTER_OPTIONS: readonly VideoFilterOption[] = [
  {
    id: 'original',
    label: 'Original',
    gradient: 'linear-gradient(135deg, #3d5a80 0%, #98c1d9 50%, #ee6c4d 100%)',
    filter: 'none',
  },
  {
    id: 'warm',
    label: 'Warm',
    gradient: 'linear-gradient(135deg, #7a2e12 0%, #d37918 55%, #f6d365 100%)',
    filter: 'sepia(0.28) saturate(1.35) hue-rotate(-10deg)',
  },
  {
    id: 'cool',
    label: 'Cool',
    gradient: 'linear-gradient(135deg, #12324a 0%, #2f6f8f 55%, #9fd6e8 100%)',
    filter: 'saturate(1.2) hue-rotate(18deg) brightness(1.02)',
  },
  {
    id: 'mono',
    label: 'Mono',
    gradient: 'linear-gradient(135deg, #1a1a1a 0%, #8a8a8a 55%, #efefef 100%)',
    filter: 'grayscale(1) contrast(1.1)',
  },
  {
    id: 'vivid',
    label: 'Vivid',
    gradient: 'linear-gradient(135deg, #b31942 0%, #f2a900 50%, #1d6fb8 100%)',
    filter: 'saturate(1.8) contrast(1.15)',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    gradient: 'linear-gradient(135deg, #16130f 0%, #6b4a2b 55%, #c9a66b 100%)',
    filter: 'sepia(0.5) saturate(0.85) contrast(1.15) brightness(0.95)',
  },
];

export const DEFAULT_AV_PREFS: Readonly<AvPrefs> = {
  audioTrack: 'audio-1',
  outputDevice: 'system-default',
  videoFilter: 'original',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionId<T extends string>(
  value: unknown,
  options: readonly { id: T }[],
): value is T {
  return typeof value === 'string' && options.some((option) => option.id === value);
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultPrefs(): AvPrefs {
  return { ...DEFAULT_AV_PREFS };
}

/** Stored preferences are untrusted: validate each field independently. */
function sanitizePrefs(value: unknown): AvPrefs {
  const prefs = defaultPrefs();
  if (!isRecord(value)) return prefs;

  if (isOptionId(value.audioTrack, AUDIO_TRACK_OPTIONS)) {
    prefs.audioTrack = value.audioTrack;
  }
  if (isOptionId(value.outputDevice, OUTPUT_DEVICE_OPTIONS)) {
    prefs.outputDevice = value.outputDevice;
  }
  if (isOptionId(value.videoFilter, VIDEO_FILTER_OPTIONS)) {
    prefs.videoFilter = value.videoFilter;
  }

  return prefs;
}

function loadPrefs(): AvPrefs {
  const storage = getStorage();
  if (!storage) return defaultPrefs();

  try {
    const raw = storage.getItem(AV_PREFS_STORAGE_KEY);
    if (raw === null) return defaultPrefs();
    return sanitizePrefs(JSON.parse(raw) as unknown);
  } catch {
    // Malformed JSON or blocked storage: start from defaults.
    return defaultPrefs();
  }
}

function persistPrefs(prefs: AvPrefs): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(AV_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota exceeded, private mode, or blocked storage: keep preferences in memory.
  }
}

function createAvPrefsStore(): Writable<AvPrefs> {
  const store = writable<AvPrefs>(loadPrefs());

  return {
    subscribe: store.subscribe,
    set(value) {
      const prefs = sanitizePrefs(value);
      store.set(prefs);
      persistPrefs(prefs);
    },
    update(updater) {
      store.update((current) => {
        const prefs = sanitizePrefs(updater(current));
        persistPrefs(prefs);
        return prefs;
      });
    },
  };
}

/** Audio track, output device, and preview look, persisted for this device. */
export const avPrefs: Writable<AvPrefs> = createAvPrefsStore();

export function setAudioTrack(id: AudioTrackId): void {
  avPrefs.update((prefs) => ({ ...prefs, audioTrack: id }));
}

export function setOutputDevice(id: OutputDeviceId): void {
  avPrefs.update((prefs) => ({ ...prefs, outputDevice: id }));
}

export function setVideoFilter(id: VideoFilterId): void {
  avPrefs.update((prefs) => ({ ...prefs, videoFilter: id }));
}
