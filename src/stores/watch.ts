import { derived, writable } from 'svelte/store';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { hasTauri } from '../lib/tauriFs';

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

function load(): WatchEntry[] {
  // Desktop shell: the list starts empty and the SQLite snapshot is applied
  // by the boot hydration at the bottom; browser preview keeps the direct
  // localStorage read.
  if (hasTauri()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const writeWatch = createKeyWriter(STORAGE_KEY);
/** Set when a mutation lands before the SQLite snapshot has been applied. */
let changedSinceBoot = false;

function save(entries: WatchEntry[]) {
  changedSinceBoot = true;
  void writeWatch(JSON.stringify(entries));
}

export const watchEntries = writable<WatchEntry[]>(load());

// Desktop hydration: swap in the persisted watch list once resolved (the
// legacy webview blob migrates into SQLite on this first pass). Mutations
// that beat the read win and the snapshot is dropped, so a late snapshot can
// never overwrite fresh progress entries.
void (async () => {
  const raw = await loadPersistedRaw(STORAGE_KEY);
  if (raw === null || changedSinceBoot) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) watchEntries.set(parsed);
  } catch {
    // Malformed legacy blob: the session starts with an empty list.
  }
})();

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

/** Mark an existing watch entry as fully watched and persist the change. */
export function markWatched(mediaKey: string, type: WatchType): void {
  watchEntries.update(list => {
    const idx = list.findIndex(e => e.mediaKey === mediaKey && e.type === type);
    if (idx < 0) return list;

    const updated = [...list];
    const entry = updated[idx];
    updated[idx] = {
      ...entry,
      watched: true,
      position: entry.duration,
      lastWatchedAt: Date.now(),
    };
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
