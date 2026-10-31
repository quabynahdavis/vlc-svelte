import { derived, writable } from 'svelte/store';

export type WatchType = 'video' | 'music' | 'stream';

export interface WatchEntry {
  mediaKey: string;
  type: WatchType;
  title: string;
  artist?: string;
  thumbnail?: string;
  src?: string;
  position: number;
  duration: number;
  lastWatchedAt: number;
  watched: boolean;
}

const STORAGE_KEY = 'vlc.watch.v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function load(): WatchEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: WatchEntry[]) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

// Initialize with seed if empty
let initialData = load();
if (initialData.length === 0 && typeof window !== 'undefined') {
  const storage = getStorage();
  if (storage && !storage.getItem(STORAGE_KEY)) {
    const now = Date.now();
    initialData = [
      { mediaKey: 'video-1', type: 'video', title: 'The Last of Us S01E03', artist: '', thumbnail: 'https://picsum.photos/seed/tlou3/320/180', src: 'https://example.com/tlou3.mp4', position: 1420, duration: 3240, lastWatchedAt: now - 1000 * 60 * 60 * 2, watched: false },
      { mediaKey: 'video-2', type: 'video', title: 'Dune (2021)', artist: '', thumbnail: 'https://picsum.photos/seed/dune/320/180', src: 'https://example.com/dune.mp4', position: 5600, duration: 9300, lastWatchedAt: now - 1000 * 60 * 60 * 24, watched: false },
      { mediaKey: 'video-3', type: 'video', title: 'Severance S01E01', artist: '', thumbnail: 'https://picsum.photos/seed/severance/320/180', src: 'https://example.com/severance.mp4', position: 800, duration: 2800, lastWatchedAt: now - 1000 * 60 * 60 * 48, watched: false },
      { mediaKey: 'music-1', type: 'music', title: 'Blinding Lights', artist: 'The Weeknd', thumbnail: 'https://picsum.photos/seed/blinding/180/180', src: 'https://example.com/blinding.mp3', position: 45, duration: 200, lastWatchedAt: now - 1000 * 60 * 30, watched: false },
      { mediaKey: 'music-2', type: 'music', title: 'Levitating', artist: 'Dua Lipa', thumbnail: 'https://picsum.photos/seed/levitating/180/180', src: 'https://example.com/levitating.mp3', position: 120, duration: 203, lastWatchedAt: now - 1000 * 60 * 60 * 3, watched: false },
      { mediaKey: 'stream-1', type: 'stream', title: 'BBC World News', artist: '', thumbnail: '', src: 'https://example.com/bbc.m3u8', position: 1800, duration: 3600, lastWatchedAt: now - 1000 * 60 * 60 * 6, watched: false },
    ];
    save(initialData);
  }
}

export const watchEntries = writable<WatchEntry[]>(initialData);

export function upsertWatch(entry: Partial<WatchEntry> & { mediaKey: string; type: WatchType; title: string; duration: number }) {
  watchEntries.update((list) => {
    const idx = list.findIndex(e => e.mediaKey === entry.mediaKey && e.type === entry.type);
    const now = Date.now();
    const next: WatchEntry = {
      mediaKey: entry.mediaKey,
      type: entry.type,
      title: entry.title,
      artist: entry.artist ?? '',
      thumbnail: entry.thumbnail ?? '',
      src: entry.src ?? '',
      position: entry.position ?? 0,
      duration: entry.duration,
      lastWatchedAt: now,
      watched: ((entry.position ?? 0) >= (entry.duration * 0.98)) || (entry.watched ?? false),
    };
    if (idx >= 0) {
      const updated = [...list];
      updated[idx] = { ...updated[idx], ...next };
      save(updated);
      return updated;
    }
    const updated = [next, ...list];
    save(updated);
    return updated;
  });
}

export function removeWatch(mediaKey: string, type: WatchType) {
  watchEntries.update(list => {
    const updated = list.filter(e => !(e.mediaKey === mediaKey && e.type === type));
    save(updated);
    return updated;
  });
}

export const continueItems = derived(watchEntries, $entries => {
  return $entries
    .filter(e => !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
});

export function getContinueByType(type: WatchType, limit = 5) {
  return derived(watchEntries, $entries => {
    return $entries
      .filter(e => e.type === type && !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98 && e.position / e.duration > 0.02)
      .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
      .slice(0, limit);
  });
}
