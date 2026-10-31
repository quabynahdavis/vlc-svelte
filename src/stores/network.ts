import { get, writable } from 'svelte/store';

/** A stream the user saved from the Network section. */
export type SavedStream = {
  id: string;
  name: string;
  url: string;
  addedAt: number;
};

/** Versioned key; bump the suffix when the persisted shape changes. */
export const SAVED_STREAMS_STORAGE_KEY = 'vlc.network.streams.v1';

/** Keep the saved list small enough to stay useful and cheap to load. */
export const MAX_SAVED_STREAMS = 100;

export const MAX_STREAM_NAME_LENGTH = 120;
export const MAX_STREAM_URL_LENGTH = 2048;

/** Protocols accepted for saved streams (case-insensitive). */
const SUPPORTED_STREAM_PROTOCOLS = ['http:', 'https:', 'rtsp:', 'rtmp:', 'mms:'] as const;

export const networkSelectedCategory = writable<string>('Local Network');
export const networkPath = writable<string[]>([]);
export const networkSearch = writable('');
export const networkViewSubPath = writable<string | null>(null);

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

/**
 * Parse and validate a user-supplied stream URL.
 *
 * Returns the canonical href when the URL is usable, otherwise null. Object
 * URLs (`blob:`) and every other scheme outside the allowlist are rejected so
 * a session-only object URL can never reach localStorage.
 */
export function normalizeStreamUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_STREAM_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!parsed.hostname) return null;
  if (!(SUPPORTED_STREAM_PROTOCOLS as readonly string[]).includes(parsed.protocol.toLowerCase())) {
    return null;
  }

  return parsed.href;
}

/** Human-readable validation error, or null when the URL is accepted. */
export function describeStreamUrlError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Enter a stream URL.';
  if (trimmed.length > MAX_STREAM_URL_LENGTH) return 'That URL is too long.';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Enter a valid URL, for example https://example.com/stream.';
  }

  if (!parsed.hostname) {
    return 'Enter a valid URL, for example https://example.com/stream.';
  }

  if (!(SUPPORTED_STREAM_PROTOCOLS as readonly string[]).includes(parsed.protocol.toLowerCase())) {
    return 'That URL is not supported. Use HTTP, HTTPS, RTSP, RTMP or MMS.';
  }

  return null;
}

/** Stable comparison key: scheme and host are case-insensitive, paths are not. */
function streamUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Build a friendly fallback name from the URL host and final path segment. */
export function deriveStreamName(input: string): string {
  const normalized = normalizeStreamUrl(input);
  if (!normalized) return input.trim();

  try {
    const parsed = new URL(normalized);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.length > 0 ? segments[segments.length - 1] : '';
    let decoded = last;
    if (last) {
      try {
        decoded = decodeURIComponent(last);
      } catch {
        decoded = last;
      }
    }
    const fallback = decoded ? `${parsed.host} · ${decoded}` : parsed.host;
    return fallback.slice(0, MAX_STREAM_NAME_LENGTH);
  } catch {
    return normalized.slice(0, MAX_STREAM_NAME_LENGTH);
  }
}

function resolveStreamName(name: string | undefined, url: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const resolved = trimmed || deriveStreamName(url);
  return resolved.slice(0, MAX_STREAM_NAME_LENGTH);
}

let idCounter = 0;

/** crypto.randomUUID when available, with a collision-resistant counter fallback. */
function createStreamId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return `stream-${crypto.randomUUID()}`;
    } catch {
      // Fall through to the counter-based id.
    }
  }

  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `stream-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`;
}

function sanitizeStream(value: unknown): SavedStream | null {
  if (!isRecord(value)) return null;

  const { id, name, url, addedAt } = value;
  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof url !== 'string') return null;
  if (typeof addedAt !== 'number' || !Number.isFinite(addedAt) || addedAt <= 0) return null;

  const normalizedUrl = normalizeStreamUrl(url);
  if (!normalizedUrl) return null;

  return {
    id: id.trim().slice(0, 160),
    name: name.trim().slice(0, MAX_STREAM_NAME_LENGTH),
    url: normalizedUrl,
    addedAt: Math.trunc(addedAt),
  };
}

/** Load, validate, de-duplicate and cap the persisted list. */
function loadSavedStreams(): SavedStream[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(SAVED_STREAMS_STORAGE_KEY);
    if (raw === null) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const streams: SavedStream[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (const entry of parsed) {
      const stream = sanitizeStream(entry);
      if (!stream) continue;

      const urlKey = streamUrlKey(stream.url);
      if (seenIds.has(stream.id) || seenUrls.has(urlKey)) continue;

      seenIds.add(stream.id);
      seenUrls.add(urlKey);
      streams.push(stream);
      if (streams.length >= MAX_SAVED_STREAMS) break;
    }

    return streams;
  } catch {
    return [];
  }
}

function persistSavedStreams(streams: SavedStream[]): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(SAVED_STREAMS_STORAGE_KEY, JSON.stringify(streams));
  } catch {
    // Quota exceeded, private mode or storage blocked: keep the in-memory list.
  }
}

const initialSavedStreams = loadSavedStreams();

export const savedStreams = writable<SavedStream[]>(initialSavedStreams);

let persistenceStarted = false;

savedStreams.subscribe((streams) => {
  // The initial subscription sees the hydrated value; only persist mutations.
  if (!persistenceStarted) {
    persistenceStarted = true;
    return;
  }
  persistSavedStreams(streams);
});

export type SaveStreamResult =
  | { ok: true; stream: SavedStream; duplicate: boolean }
  | { ok: false; error: string };

/** Add a stream. Duplicate URLs return the existing entry instead of copying it. */
export function addSavedStream(input: { url: string; name?: string }): SaveStreamResult {
  const error = describeStreamUrlError(input.url);
  if (error) return { ok: false, error };

  const url = normalizeStreamUrl(input.url);
  if (!url) return { ok: false, error: 'That URL is not supported.' };

  const streams = get(savedStreams);
  const key = streamUrlKey(url);
  const existing = streams.find((stream) => streamUrlKey(stream.url) === key);
  if (existing) return { ok: true, stream: existing, duplicate: true };

  const stream: SavedStream = {
    id: createStreamId(),
    name: resolveStreamName(input.name, url),
    url,
    addedAt: Date.now(),
  };

  savedStreams.set([stream, ...streams].slice(0, MAX_SAVED_STREAMS));
  return { ok: true, stream, duplicate: false };
}

/** Edit a stream in place, preserving its id and original added date. */
export function updateSavedStream(
  id: string,
  input: { url: string; name?: string },
): SaveStreamResult {
  const error = describeStreamUrlError(input.url);
  if (error) return { ok: false, error };

  const url = normalizeStreamUrl(input.url);
  if (!url) return { ok: false, error: 'That URL is not supported.' };

  const streams = get(savedStreams);
  const index = streams.findIndex((stream) => stream.id === id);
  if (index < 0) return { ok: false, error: 'That stream no longer exists.' };

  const key = streamUrlKey(url);
  const duplicate = streams.find(
    (stream) => stream.id !== id && streamUrlKey(stream.url) === key,
  );
  if (duplicate) {
    return { ok: false, error: 'Another saved stream already uses that URL.' };
  }

  const current = streams[index];
  const stream: SavedStream = {
    ...current,
    name: resolveStreamName(input.name, url),
    url,
  };

  const next = streams.slice();
  next[index] = stream;
  savedStreams.set(next);

  return { ok: true, stream, duplicate: false };
}

/** Remove a stream by id. Returns false when it was already gone. */
export function removeSavedStream(id: string): boolean {
  const streams = get(savedStreams);
  const next = streams.filter((stream) => stream.id !== id);
  if (next.length === streams.length) return false;
  savedStreams.set(next);
  return true;
}
