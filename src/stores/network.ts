import { get, writable } from 'svelte/store';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { normalizeFeedUrl, normalizeJamendoClientId } from '../lib/networkParse';
import { hasTauri } from '../lib/tauriFs';
import type { MediaItem } from '../lib/mock';

/** A stream the user saved from the Network section. */
export type SavedStream = {
  id: string;
  name: string;
  url: string;
  addedAt: number;
};

/** Versioned key; bump the suffix when the persisted shape changes. */
export const SAVED_STREAMS_STORAGE_KEY = 'vlc.network.streams.v1';

/** Subscribed podcast feeds. Episodes are fetched again; only the subscription is stored. */
export const PODCAST_SUBSCRIPTIONS_STORAGE_KEY = 'vlc.network.podcasts.v1';

/** The user's Jamendo client id. Empty means the catalog stays closed. */
export const JAMENDO_CLIENT_STORAGE_KEY = 'vlc.network.jamendo.v1';

/** Keep the saved list small enough to stay useful and cheap to load. */
export const MAX_SAVED_STREAMS = 100;

export const MAX_STREAM_NAME_LENGTH = 120;
export const MAX_STREAM_URL_LENGTH = 2048;

/** Protocols accepted for saved streams (case-insensitive). */
const SUPPORTED_STREAM_PROTOCOLS = ['http:', 'https:', 'rtsp:', 'rtmp:', 'mms:'] as const;

export const networkSelectedCategory = writable<string>('Network');
/** Drill-in stack. Empty is the source list; each segment is a source or a saved stream id. */
export const networkPath = writable<string[]>([]);
export const networkSearch = writable('');
export const networkViewSubPath = writable<string | null>(null);

/**
 * Playable media currently shown on the Network page: a browsed file, a
 * podcast episode, or a directory stream. The shared context menu resolves
 * these ids. Folders and servers are not registered here.
 */
export const networkContextMedia = writable<MediaItem[]>([]);

/** Schemes the Open Network URL page will play. Mirrors VLC's network MRLs. */
const NETWORK_LOCATION_SCHEMES = new Set([
  'http:',
  'https:',
  'ftp:',
  'ftps:',
  'sftp:',
  'smb:',
  'nfs:',
  'rtsp:',
  'rtp:',
  'udp:',
  'mms:',
  'rtmp:',
]);

const SOURCE_CATEGORY: Record<string, string> = {
  saved: 'Saved Streams',
  'open-url': 'Open Network URL',
  local: 'Local Network',
  podcasts: 'Podcasts',
  radio: 'Internet Radio',
  icecast: 'Icecast',
  jamendo: 'Jamendo',
  shoutcast: 'Shoutcast',
};

networkPath.subscribe((path) => {
  const next = SOURCE_CATEGORY[path[0] ?? ''] ?? 'Network';
  if (get(networkSelectedCategory) !== next) networkSelectedCategory.set(next);
});

/**
 * Canonical playback URL for an address the user typed, or null when the
 * scheme is outside VLC's network set. `udp://@:port` and `rtp://@:port`
 * stay intact because the URL parser rejects a bind-all host.
 */
export function normalizeNetworkLocation(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_STREAM_URL_LENGTH) return null;

  const bindAll = trimmed.match(/^(udp|rtp):\/\/@:(\d{1,5})$/i);
  if (bindAll) {
    const port = Number(bindAll[2]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return `${bindAll[1].toLowerCase()}://@:${port}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!NETWORK_LOCATION_SCHEMES.has(parsed.protocol.toLowerCase())) return null;
  if (!parsed.hostname) return null;
  return parsed.href;
}

/** Human-readable validation error, or null when the address can be played. */
export function describeNetworkLocationError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Enter a network URL.';
  if (trimmed.length > MAX_STREAM_URL_LENGTH) return 'That URL is too long.';
  if (normalizeNetworkLocation(trimmed)) return null;
  return 'Use HTTP, HTTPS, FTP, FTPS, SFTP, SMB, NFS, RTSP, RTP, UDP, MMS or RTMP.';
}

/** Short label for a playback URL: host, plus the last path segment when there is one. */
export function networkLocationTitle(href: string): string {
  if (/^(udp|rtp):\/\/@:\d+$/i.test(href)) return href;

  try {
    const parsed = new URL(href);
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
    const host = parsed.host || parsed.hostname;
    const label = decoded ? `${host} · ${decoded}` : host || href;
    return label.slice(0, MAX_STREAM_NAME_LENGTH);
  } catch {
    return href.slice(0, MAX_STREAM_NAME_LENGTH);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  // Desktop shell: start with an empty list; the snapshot is applied by the
  // boot hydration. Browser preview keeps the direct localStorage read.
  if (hasTauri()) return [];

  try {
    const raw = window.localStorage.getItem(SAVED_STREAMS_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizeSavedStreamList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** Validate, de-duplicate and cap an arbitrary parsed list of streams. */
function sanitizeSavedStreamList(parsed: unknown): SavedStream[] {
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
}

const writeStreams = createKeyWriter(SAVED_STREAMS_STORAGE_KEY);

const initialSavedStreams = loadSavedStreams();

export const savedStreams = writable<SavedStream[]>(initialSavedStreams);

// The initial emission and the async SQLite hydration bypass persistence;
// writes start only after the boot snapshot settles.
let persistenceActive = false;

savedStreams.subscribe((streams) => {
  if (!persistenceActive) return;
  void writeStreams(JSON.stringify(streams));
});

// Desktop hydration: swap in the persisted snapshot once resolved (the legacy
// webview blob migrates into SQLite on this first pass).
void (async () => {
  const raw = await loadPersistedRaw(SAVED_STREAMS_STORAGE_KEY);
  if (raw !== null) {
    try {
      const next = sanitizeSavedStreamList(JSON.parse(raw) as unknown);
      if (next.length > 0) savedStreams.set(next);
    } catch {
      // Malformed legacy blob: keep the current list.
    }
  }
  persistenceActive = true;
})();

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

export const MAX_PODCAST_SUBSCRIPTIONS = 50;

export type PodcastSubscription = {
  id: string;
  feedUrl: string;
  title: string;
  addedAt: number;
};

function sanitizeSubscription(value: unknown): PodcastSubscription | null {
  if (!isRecord(value)) return null;
  const { id, feedUrl, title, addedAt } = value;
  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof feedUrl !== 'string') return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof addedAt !== 'number' || !Number.isFinite(addedAt) || addedAt <= 0) return null;
  const normalized = normalizeFeedUrl(feedUrl);
  if (!normalized) return null;
  return {
    id: id.trim().slice(0, 160),
    feedUrl: normalized,
    title: title.trim().slice(0, MAX_STREAM_NAME_LENGTH),
    addedAt: Math.trunc(addedAt),
  };
}

function sanitizeSubscriptionList(parsed: unknown): PodcastSubscription[] {
  if (!Array.isArray(parsed)) return [];
  const subscriptions: PodcastSubscription[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const entry of parsed) {
    const subscription = sanitizeSubscription(entry);
    if (!subscription) continue;
    const urlKey = streamUrlKey(subscription.feedUrl);
    if (seenIds.has(subscription.id) || seenUrls.has(urlKey)) continue;
    seenIds.add(subscription.id);
    seenUrls.add(urlKey);
    subscriptions.push(subscription);
    if (subscriptions.length >= MAX_PODCAST_SUBSCRIPTIONS) break;
  }
  return subscriptions;
}

function loadPodcastSubscriptions(): PodcastSubscription[] {
  if (hasTauri()) return [];
  try {
    const raw = window.localStorage.getItem(PODCAST_SUBSCRIPTIONS_STORAGE_KEY);
    if (raw === null) return [];
    return sanitizeSubscriptionList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

const writePodcasts = createKeyWriter(PODCAST_SUBSCRIPTIONS_STORAGE_KEY);
export const podcastSubscriptions = writable<PodcastSubscription[]>(loadPodcastSubscriptions());
let podcastPersistenceActive = false;

podcastSubscriptions.subscribe((subscriptions) => {
  if (!podcastPersistenceActive) return;
  void writePodcasts(JSON.stringify(subscriptions));
});

void (async () => {
  const raw = await loadPersistedRaw(PODCAST_SUBSCRIPTIONS_STORAGE_KEY);
  if (raw !== null) {
    try {
      const next = sanitizeSubscriptionList(JSON.parse(raw) as unknown);
      if (next.length > 0) podcastSubscriptions.set(next);
    } catch {
      // Malformed blob: keep the current list.
    }
  }
  podcastPersistenceActive = true;
})();

export type SavePodcastResult =
  | { ok: true; subscription: PodcastSubscription; duplicate: boolean }
  | { ok: false; error: string };

export function addPodcastSubscription(input: { feedUrl: string; title: string }): SavePodcastResult {
  const feedUrl = normalizeFeedUrl(input.feedUrl);
  if (!feedUrl) return { ok: false, error: 'Enter an http or https feed URL.' };
  const subscriptions = get(podcastSubscriptions);
  const key = streamUrlKey(feedUrl);
  const existing = subscriptions.find((subscription) => streamUrlKey(subscription.feedUrl) === key);
  if (existing) return { ok: true, subscription: existing, duplicate: true };
  const subscription: PodcastSubscription = {
    id: createStreamId().replace(/^stream-/, 'podcast-'),
    feedUrl,
    title: (input.title.trim() || 'Podcast').slice(0, MAX_STREAM_NAME_LENGTH),
    addedAt: Date.now(),
  };
  podcastSubscriptions.set([subscription, ...subscriptions].slice(0, MAX_PODCAST_SUBSCRIPTIONS));
  return { ok: true, subscription, duplicate: false };
}

export function renamePodcastSubscription(id: string, title: string): void {
  const trimmed = title.trim().slice(0, MAX_STREAM_NAME_LENGTH);
  if (!trimmed) return;
  const subscriptions = get(podcastSubscriptions);
  const index = subscriptions.findIndex((subscription) => subscription.id === id);
  if (index < 0 || subscriptions[index].title === trimmed) return;
  const next = subscriptions.slice();
  next[index] = { ...subscriptions[index], title: trimmed };
  podcastSubscriptions.set(next);
}

export function removePodcastSubscription(id: string): boolean {
  const subscriptions = get(podcastSubscriptions);
  const next = subscriptions.filter((subscription) => subscription.id !== id);
  if (next.length === subscriptions.length) return false;
  podcastSubscriptions.set(next);
  return true;
}

function sanitizeJamendoClient(parsed: unknown): string {
  if (!isRecord(parsed) || typeof parsed.clientId !== 'string') return '';
  return normalizeJamendoClientId(parsed.clientId) ?? '';
}

function loadJamendoClientId(): string {
  if (hasTauri()) return '';
  try {
    const raw = window.localStorage.getItem(JAMENDO_CLIENT_STORAGE_KEY);
    if (raw === null) return '';
    return sanitizeJamendoClient(JSON.parse(raw) as unknown);
  } catch {
    return '';
  }
}

const writeJamendo = createKeyWriter(JAMENDO_CLIENT_STORAGE_KEY);
export const jamendoClientId = writable<string>(loadJamendoClientId());
let jamendoPersistenceActive = false;

jamendoClientId.subscribe((clientId) => {
  if (!jamendoPersistenceActive) return;
  void writeJamendo(JSON.stringify({ clientId }));
});

void (async () => {
  const raw = await loadPersistedRaw(JAMENDO_CLIENT_STORAGE_KEY);
  if (raw !== null) {
    try {
      const next = sanitizeJamendoClient(JSON.parse(raw) as unknown);
      if (next) jamendoClientId.set(next);
    } catch {
      // Malformed blob: keep the current id.
    }
  }
  jamendoPersistenceActive = true;
})();

export function setJamendoClientId(input: string): { ok: true; clientId: string } | { ok: false; error: string } {
  const clientId = normalizeJamendoClientId(input);
  if (!clientId) {
    return { ok: false, error: 'Enter the client id from your Jamendo application. It is not built into Kanea.' };
  }
  jamendoClientId.set(clientId);
  return { ok: true, clientId };
}

export function clearJamendoClientId(): void {
  jamendoClientId.set('');
}
