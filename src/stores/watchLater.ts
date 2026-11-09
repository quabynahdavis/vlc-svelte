import { writable, derived, get, type Writable } from 'svelte/store';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import type { WatchType } from './watch';
import { hasTauri } from '../lib/tauriFs';

export interface WatchLaterEntry {
  id: string;
  mediaKey: string;
  type: WatchType;
  title: string;
  artist?: string;
  thumbnail?: string;
  src?: string;
  duration: number;
  createdAt: number;
}

export const WATCH_LATER_STORAGE_KEY = 'vlc.watchlater.v1';
export const MAX_WATCH_LATER = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeWatchLater(value: unknown): WatchLaterEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: WatchLaterEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const mediaKey = typeof item.mediaKey === 'string' ? item.mediaKey.trim() : '';
    const type = item.type;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const duration = typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 0 ? item.duration : null;
    const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : null;
    if (!id || !mediaKey || !title || duration === null || createdAt === null || seen.has(id)) continue;
    if (type !== 'video' && type !== 'music' && type !== 'stream') continue;
    const artist = typeof item.artist === 'string' ? item.artist : undefined;
    const thumbnail = typeof item.thumbnail === 'string' ? item.thumbnail : undefined;
    const src = typeof item.src === 'string' ? item.src : undefined;
    seen.add(id);
    out.push({ id, mediaKey, type, title, artist, thumbnail, src, duration, createdAt });
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out.slice(-MAX_WATCH_LATER);
}

function loadWatchLater(): WatchLaterEntry[] {
  // Desktop shell: start empty; the snapshot is applied by the boot hydration.
  if (hasTauri()) return [];

  try {
    const raw = window.localStorage.getItem(WATCH_LATER_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizeWatchLater(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

const writeWatchLater = createKeyWriter(WATCH_LATER_STORAGE_KEY);

function createWatchLaterStore(): Writable<WatchLaterEntry[]> {
  const store = writable<WatchLaterEntry[]>(loadWatchLater());

  /** Set when a mutation lands before the SQLite snapshot has been applied. */
  let changedSinceBoot = false;

  function persistWatchLater(entries: WatchLaterEntry[]): void {
    changedSinceBoot = true;
    void writeWatchLater(JSON.stringify(entries));
  }

  // Desktop hydration: apply the persisted snapshot only when no mutation
  // landed while reading, so items added during boot are kept.
  void (async () => {
    const raw = await loadPersistedRaw(WATCH_LATER_STORAGE_KEY);
    if (raw === null || changedSinceBoot) return;
    try {
      store.set(sanitizeWatchLater(JSON.parse(raw) as unknown));
    } catch {
      // Malformed legacy blob: the session starts with an empty list.
    }
  })();

  return {
    subscribe: store.subscribe,
    set(value) {
      const next = sanitizeWatchLater(value);
      store.set(next);
      persistWatchLater(next);
    },
    update(updater) {
      store.update((current) => {
        const next = sanitizeWatchLater(updater(current));
        persistWatchLater(next);
        return next;
      });
    },
  };
}

export const watchLater: Writable<WatchLaterEntry[]> = createWatchLaterStore();

export function addWatchLater(entry: Omit<WatchLaterEntry, 'id' | 'createdAt'>): WatchLaterEntry | null {
  if (!entry.mediaKey || !entry.title || typeof entry.duration !== 'number' || !Number.isFinite(entry.duration)) return null;
  const normalized = {
    mediaKey: entry.mediaKey.trim(),
    title: entry.title.trim(),
    type: entry.type,
    artist: entry.artist,
    thumbnail: entry.thumbnail,
    src: entry.src,
    duration: entry.duration,
  };
  let result: WatchLaterEntry | null = null;
  watchLater.update((list) => {
    if (list.some(e => e.mediaKey === normalized.mediaKey && e.type === normalized.type)) {
      return list;
    }
    const newEntry: WatchLaterEntry = {
      id: createId(),
      createdAt: Date.now(),
      ...normalized,
    };
    result = newEntry;
    const next = [newEntry, ...list].slice(0, MAX_WATCH_LATER);
    return next;
  });
  return result;
}

export function removeWatchLater(id: string): void {
  if (!id) return;
  watchLater.update((current) => current.filter((e) => e.id !== id));
}

export function toggleWatchLater(entry: Omit<WatchLaterEntry, 'id' | 'createdAt'>): boolean {
  if (!entry.mediaKey || !entry.title || typeof entry.duration !== 'number' || !Number.isFinite(entry.duration)) return false;
  const normalizedMediaKey = entry.mediaKey.trim();
  const normalizedTitle = entry.title.trim();
  let added = false;
  watchLater.update((list) => {
    const idx = list.findIndex(e => e.mediaKey === normalizedMediaKey && e.type === entry.type);
    if (idx >= 0) {
      added = false;
      return list.filter((_, i) => i !== idx);
    }
    added = true;
    const newEntry: WatchLaterEntry = {
      id: createId(),
      createdAt: Date.now(),
      mediaKey: normalizedMediaKey,
      type: entry.type,
      title: normalizedTitle,
      artist: entry.artist,
      thumbnail: entry.thumbnail,
      src: entry.src,
      duration: entry.duration,
    };
    return [newEntry, ...list].slice(0, MAX_WATCH_LATER);
  });
  return added;
}

export function isWatchLater(mediaKey: string, type: WatchType) {
  return derived(watchLater, ($list) => $list.some(e => e.mediaKey === mediaKey && e.type === type));
}
