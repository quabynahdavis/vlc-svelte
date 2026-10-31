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

export const watchEntries = writable<WatchEntry[]>(load());

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
