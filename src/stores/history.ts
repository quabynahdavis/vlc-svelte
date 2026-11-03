import { writable, derived, type Writable } from 'svelte/store';
import type { WatchType } from './watch';

export interface HistoryEntry {
  id: string;
  mediaKey: string;
  type: WatchType;
  title: string;
  artist?: string;
  thumbnail?: string;
  src?: string;
  duration: number;
  position: number;
  createdAt: number;
  lastPlayedAt: number;
}

export const HISTORY_STORAGE_KEY = 'vlc.history.v1';
export const MAX_HISTORY = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const mediaKey = typeof item.mediaKey === 'string' ? item.mediaKey.trim() : '';
    const type = item.type;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const duration = typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 0 ? item.duration : null;
    const position = typeof item.position === 'number' && Number.isFinite(item.position) && item.position >= 0 ? item.position : null;
    const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : null;
    const lastPlayedAt = typeof item.lastPlayedAt === 'number' && Number.isFinite(item.lastPlayedAt) ? item.lastPlayedAt : null;
    if (!id || !mediaKey || !title || duration === null || position === null || createdAt === null || lastPlayedAt === null || seen.has(id)) continue;
    if (type !== 'video' && type !== 'music' && type !== 'stream') continue;
    const artist = typeof item.artist === 'string' ? item.artist : undefined;
    const thumbnail = typeof item.thumbnail === 'string' ? item.thumbnail : undefined;
    const src = typeof item.src === 'string' ? item.src : undefined;
    seen.add(id);
    out.push({ id, mediaKey, type, title, artist, thumbnail, src, duration, position, createdAt, lastPlayedAt });
  }
  out.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  return out.slice(0, MAX_HISTORY);
}

function loadHistory(): HistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizeHistory(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function persistHistory(entries: HistoryEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // private mode / quota
  }
}

function createHistoryStore(): Writable<HistoryEntry[]> {
  const store = writable<HistoryEntry[]>(loadHistory());
  return {
    subscribe: store.subscribe,
    set(value) {
      const next = sanitizeHistory(value);
      store.set(next);
      persistHistory(next);
    },
    update(updater) {
      store.update((current) => {
        const next = sanitizeHistory(updater(current));
        persistHistory(next);
        return next;
      });
    },
  };
}

export const history: Writable<HistoryEntry[]> = createHistoryStore();

export function recordHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'lastPlayedAt'>): HistoryEntry | null {
  if (!entry.mediaKey || !entry.title || typeof entry.duration !== 'number' || !Number.isFinite(entry.duration) || typeof entry.position !== 'number' || !Number.isFinite(entry.position)) {
    return null;
  }
  const normalized = {
    mediaKey: entry.mediaKey.trim(),
    title: entry.title.trim(),
    type: entry.type,
    artist: entry.artist,
    thumbnail: entry.thumbnail,
    src: entry.src,
    duration: entry.duration,
    position: entry.position,
  };
  let result: HistoryEntry | null = null;
  history.update((list) => {
    const now = Date.now();
    const idx = list.findIndex(e => e.mediaKey === normalized.mediaKey && e.type === normalized.type);
    if (idx >= 0) {
      const existing = list[idx];
      const updated: HistoryEntry = {
        ...existing,
        title: normalized.title,
        artist: normalized.artist ?? existing.artist,
        thumbnail: normalized.thumbnail ?? existing.thumbnail,
        src: normalized.src ?? existing.src,
        duration: normalized.duration,
        position: normalized.position,
        lastPlayedAt: now,
      };
      result = updated;
      const next = [updated, ...list.filter((_, i) => i !== idx)].slice(0, MAX_HISTORY);
      return next;
    }
    const newEntry: HistoryEntry = {
      id: createId(),
      createdAt: now,
      lastPlayedAt: now,
      ...normalized,
    };
    result = newEntry;
    return [newEntry, ...list].slice(0, MAX_HISTORY);
  });
  return result;
}

export function clearHistory(): void {
  history.set([]);
}

export function removeHistory(id: string): void {
  if (!id) return;
  history.update((current) => current.filter((e) => e.id !== id));
}

export function historyByMediaKey(mediaKey: string, type: WatchType) {
  return derived(history, ($list) => $list.find(e => e.mediaKey === mediaKey && e.type === type) ?? null);
}
