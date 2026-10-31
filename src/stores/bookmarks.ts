/**
 * Bookmarks / chapter markers for the right dock.
 *
 * Bookmarks are persisted as one array under `vlc.bookmarks.v1` and keyed by
 * media identity (the track id when available, otherwise its title). Stored
 * data is treated as untrusted: malformed entries are dropped individually and
 * the list is capped. Storage access is wrapped so private mode, disabled
 * storage, or SSR degrades to in-memory bookmarks.
 */
import { writable, type Writable } from 'svelte/store';

/** Bump the version suffix when the persisted shape changes. */
export const BOOKMARKS_STORAGE_KEY = 'vlc.bookmarks.v1';
export const MAX_BOOKMARKS = 200;
const MAX_LABEL_LENGTH = 120;

export interface Bookmark {
  id: string;
  mediaKey: string;
  time: number;
  label: string;
  createdAt: number;
}

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

/** Format a position as m:ss, or h:mm:ss once it reaches an hour. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function createBookmarkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep only well-formed, unique entries; drop the oldest when over the cap. */
function sanitizeBookmarks(value: unknown): Bookmark[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const bookmarks: Bookmark[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const mediaKey = typeof item.mediaKey === 'string' ? item.mediaKey.trim() : '';
    const time =
      typeof item.time === 'number' && Number.isFinite(item.time) && item.time >= 0
        ? item.time
        : null;

    if (!id || !mediaKey || time === null || seen.has(id)) continue;

    const rawLabel = typeof item.label === 'string' ? item.label.trim() : '';
    const label = (rawLabel || formatTimestamp(time)).slice(0, MAX_LABEL_LENGTH);
    const createdAt =
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now();

    seen.add(id);
    bookmarks.push({ id, mediaKey, time, label, createdAt });
  }

  bookmarks.sort((a, b) => a.createdAt - b.createdAt);
  return bookmarks.slice(-MAX_BOOKMARKS);
}

function loadBookmarks(): Bookmark[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(BOOKMARKS_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizeBookmarks(JSON.parse(raw) as unknown);
  } catch {
    // Malformed JSON or blocked storage: start with no bookmarks.
    return [];
  }
}

function persistBookmarks(bookmarks: Bookmark[]): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Quota exceeded, private mode, or blocked storage: keep bookmarks in memory.
  }
}

function createBookmarksStore(): Writable<Bookmark[]> {
  const store = writable<Bookmark[]>(loadBookmarks());

  return {
    subscribe: store.subscribe,
    set(value) {
      const next = sanitizeBookmarks(value);
      store.set(next);
      persistBookmarks(next);
    },
    update(updater) {
      store.update((current) => {
        const next = sanitizeBookmarks(updater(current));
        persistBookmarks(next);
        return next;
      });
    },
  };
}

/** All bookmarks across media, persisted under `vlc.bookmarks.v1`. */
export const bookmarks: Writable<Bookmark[]> = createBookmarksStore();

/**
 * Stable identity for bookmark lookups: the track id when it has one,
 * otherwise the trimmed title. Returns null when neither is available.
 */
export function mediaKeyFor(track: { id?: string; title?: string } | null | undefined): string | null {
  if (!track) return null;

  const id = typeof track.id === 'string' ? track.id.trim() : '';
  if (id) return id;

  const title = typeof track.title === 'string' ? track.title.trim() : '';
  return title || null;
}

export function addBookmark(mediaKey: string, time: number, label?: string): Bookmark | null {
  const key = mediaKey.trim();
  if (!key || !Number.isFinite(time) || time < 0) return null;

  const safeTime = Math.max(0, time);
  const safeLabel = (label?.trim() || formatTimestamp(safeTime)).slice(0, MAX_LABEL_LENGTH);
  const bookmark: Bookmark = {
    id: createBookmarkId(),
    mediaKey: key,
    time: safeTime,
    label: safeLabel,
    createdAt: Date.now(),
  };

  bookmarks.update((current) => {
    const next = [...current, bookmark];
    return next.length > MAX_BOOKMARKS ? next.slice(next.length - MAX_BOOKMARKS) : next;
  });

  return bookmark;
}

export function removeBookmark(id: string): void {
  if (!id) return;
  bookmarks.update((current) => current.filter((bookmark) => bookmark.id !== id));
}
