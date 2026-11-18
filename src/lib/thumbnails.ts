/**
 * Video frame thumbnails for the library.
 *
 * On the desktop shell (Tauri) frames come from the Rust pipeline first:
 * `thumb_get` returns a JPEG previously persisted in the SQLite
 * `thumbnails` table, and `thumb_generate` extracts one with ffmpeg and
 * persists it in the same IPC roundtrip. Those paths render scanned items
 * whose Tauri asset protocol source cannot be drawn by the webview (no CORS
 * header → tainted canvas → `toDataURL` throws SecurityError).
 *
 * The webview `<video>`/canvas capture stays alive as the fallback for
 * whatever the Rust path cannot serve (missing ffmpeg binary, exotic
 * container, corrupt file) and as the only pipeline for browser sessions and
 * imported blob items — a detached `<video>` loads the item's media source,
 * seeks a little into the film, draws a frame to a canvas and exports a small
 * JPEG data URL.
 *
 * Results live in `mediaThumbnails` keyed by item id. Deliberately NOT
 * persisted on the webview side: the map is a session cache, regenerated
 * lazily when cards mount, so stored settings/items never carry megabytes of
 * frames. Failed captures are remembered for the session and stay
 * placeholders.
 */
import { writable, type Readable } from 'svelte/store';
import { hasTauri, invokeCommand } from './tauriFs';
import type { MediaItem } from './mock';

/** JPEG quality / target height for webview-exported frames. */
const JPEG_QUALITY = 0.72;
const CANVAS_HEIGHT = 240;
/** Capture a frame this far into the film (8% of duration, capped). */
const SEEK_RATIO = 0.08;
const SEEK_MIN_SECONDS = 0.1;
const SEEK_MAX_SECONDS = 45;
/** Rust extractor seek when duration is still unknown (durations probe late). */
const DESKTOP_DEFAULT_SEEK = 1.0;
/** Watchdog so a hanging decode never blocks the queue forever. */
const CAPTURE_TIMEOUT_MS = 9000;
/** Parallel decodes; more is not faster for codec threads (or ffmpeg runs). */
const MAX_CONCURRENT = 2;

/** Extension filter for the webview pipeline only — the scan pipeline has
 * already filtered media before ids become absolute paths on the desktop. */
const VIDEO_EXTENSION = /\.(mp4|m4v|mkv|webm|mov|avi|ogv|ts|m2ts|mpe?g)$/i;
const BROWSER_SRC_EXTENSION = /\.(mp4|m4v|mkv|webm|mov|avi|ogv)$/i;

/** Scanned item ids are absolute file paths (Windows drives tolerated). */
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|[/\\])/;

/** Encode in 32,767-element chunks so the spread never overflows the stack. */
const BASE64_CHUNK = 0x8000;

const content: Map<string, string> = new Map();
const pending = new Map<string, string>();
const failed = new Set<string>();
const queue: string[] = [];
const items = new Map<string, MediaItem>();
let inflight = 0;

const store = writable<Map<string, string>>(new Map());

/** Read-only view: item id → small JPEG data URL. */
export const mediaThumbnails: Readable<Map<string, string>> = { subscribe: store.subscribe };

function commit(): void {
    store.set(new Map(content));
}

/** True when the desktop shell serves thumbnails for this item id. */
function isDesktopPathItem(item: MediaItem): boolean {
    return hasTauri() && ABSOLUTE_PATH.test(item.id);
}

/**
 * Queue a thumbnail for `item` (no-op when one exists, is pending, or the
 * attempt failed earlier this session). Safe to call from every rendered card.
 */
export function ensureItemThumbnail(item: MediaItem): void {
    if (content.has(item.id) || pending.has(item.id) || failed.has(item.id)) return;

    // Desktop: absolute file-path ids resolve through the Rust pipeline and
    // need no webview-decodable source; the scan pipeline already filtered
    // media, so the extension gate is skipped here (audio files simply get
    // no frame from Rust and no decodable video in the fallback).
    if (isDesktopPathItem(item)) {
        pending.set(item.id, '');
        items.set(item.id, item);
        queue.push(item.id);
        pump();
        return;
    }

    const src = item.src;
    if (!src) return;
    if (!VIDEO_EXTENSION.test(item.title) && !BROWSER_SRC_EXTENSION.test(src)) return;

    pending.set(item.id, src);
    items.set(item.id, item);
    queue.push(item.id);
    pump();
}

function pump(): void {
    while (inflight < MAX_CONCURRENT && queue.length > 0) {
        const id = queue.shift();
        const item = id ? items.get(id) : undefined;
        if (!id || !item) {
            if (id) pending.delete(id);
            continue;
        }

        inflight += 1;
        void resolve(item)
            .catch(() => null)
            .then((dataUrl) => {
                inflight -= 1;
                pending.delete(id);

                if (dataUrl) {
                    content.set(id, dataUrl);
                } else {
                    failed.add(id);
                    items.delete(id);
                }
                commit();
                pump();
            });
    }
}

/** Rust table → Rust extractor → webview capture. Resolves null on failure. */
async function resolve(item: MediaItem): Promise<string | null> {
    if (isDesktopPathItem(item)) {
        const stored = await readThumbnailFromRust(item.id);
        if (stored) return stored;

        const generated = await generateThumbnailInRust(item);
        if (generated) return generated;

        // Rust pipeline could not serve a frame; try the webview capture
        // when there is anything webview-decodable behind the item at all.
        if (!item.src) return null;
    }

    if (!item.src) return null;
    return capture(item.src);
}

/** `thumb_get`: previous run's extraction, keyed by the absolute file path. */
async function readThumbnailFromRust(path: string): Promise<string | null> {
    const bytes = await invokeCommand<number[] | Uint8Array>('thumb_get', { path });
    return bytes && bytes.length > 0 ? bytesToJpegDataUrl(bytes) : null;
}

/** `thumb_generate`: ffmpeg extraction; Rust persists the bytes itself. */
async function generateThumbnailInRust(item: MediaItem): Promise<string | null> {
    const duration = item.durationSeconds;
    const seek =
        duration > 0
            ? Math.min(Math.max(duration * SEEK_RATIO, SEEK_MIN_SECONDS), SEEK_MAX_SECONDS)
            : DESKTOP_DEFAULT_SEEK;

    const bytes = await invokeCommand<number[] | Uint8Array>('thumb_generate', {
        path: item.id,
        seekSeconds: seek,
        persist: true,
    });
    return bytes && bytes.length > 0 ? bytesToJpegDataUrl(bytes) : null;
}

/**
 * One second per hover frame. Nearby pointer positions share a JPEG, and the
 * session cache key is the file path plus this second.
 */
const HOVER_BUCKET_SECONDS = 1;
const HOVER_CACHE_LIMIT = 48;

/** path + hovered second → JPEG data URL. Not the SQLite poster row. */
const hoverFrames = new Map<string, string>();
const hoverPending = new Map<string, Promise<string | null>>();

function hoverSecond(seekSeconds: number): number {
    if (!Number.isFinite(seekSeconds) || seekSeconds <= 0) return 0;
    return Math.round(seekSeconds / HOVER_BUCKET_SECONDS) * HOVER_BUCKET_SECONDS;
}

function hoverCacheKey(path: string, second: number): string {
    return `${path}\0${second}`;
}

function rememberHoverFrame(key: string, dataUrl: string): void {
    if (hoverFrames.has(key)) hoverFrames.delete(key);
    hoverFrames.set(key, dataUrl);
    while (hoverFrames.size > HOVER_CACHE_LIMIT) {
        const oldest = hoverFrames.keys().next().value;
        if (oldest === undefined) break;
        hoverFrames.delete(oldest);
    }
}

/**
 * JPEG for a local video at `seekSeconds`.
 *
 * `thumb_get` reads the single library poster stored for `path`. That row is
 * not a frame at an arbitrary time, so hover does not use it. The frame comes
 * from `thumb_generate` at the hovered second, with `persist: false`, and is
 * kept in a session cache keyed by the path and that second. A stream has no
 * local path and never reaches this function.
 */
export async function thumbnailAtTime(path: string, seekSeconds: number): Promise<string | null> {
    if (!hasTauri() || !path) return null;

    const second = hoverSecond(seekSeconds);
    const key = hoverCacheKey(path, second);
    const cached = hoverFrames.get(key);
    if (cached) {
        hoverFrames.delete(key);
        hoverFrames.set(key, cached);
        return cached;
    }

    const pending = hoverPending.get(key);
    if (pending) return pending;

    const task = invokeCommand<number[] | Uint8Array>('thumb_generate', {
        path,
        seekSeconds: second,
        persist: false,
    })
        .then((bytes) => {
            if (!bytes || bytes.length === 0) return null;
            const dataUrl = bytesToJpegDataUrl(bytes);
            rememberHoverFrame(key, dataUrl);
            return dataUrl;
        })
        .finally(() => {
            hoverPending.delete(key);
        });

    hoverPending.set(key, task);
    return task;
}

/** Small JPEG payload → data URL, b64-encoded in bounded chunks. */
function bytesToJpegDataUrl(bytes: number[] | Uint8Array): string {
    const raw = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    let binary = '';
    for (let start = 0; start < raw.length; start += BASE64_CHUNK) {
        const chunk = raw.subarray(start, start + BASE64_CHUNK);
        binary += String.fromCharCode(...chunk);
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** Load → seek → draw → export. Resolves null on any failure. */
function capture(src: string): Promise<string | null> {
    return attempt(src, true)
        .then((result) => result ?? attempt(src, false).catch(() => null))
        .then((result) => result ?? null);
}

function attempt(src: string, useCrossOrigin: boolean): Promise<string | null> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        if (useCrossOrigin) video.crossOrigin = 'anonymous';

        let settled = false;
        const finish = (result: string | null): void => {
            if (settled) return;
            settled = true;
            window.clearTimeout(guard);
            video.removeAttribute('src');
            video.load();
            resolve(result && result.length > 0 ? result : null);
        };

        const exportFrame = (): void => {
            try {
                const { videoWidth, videoHeight } = video;
                if (!videoWidth || !videoHeight) return finish(null);

                const canvas = document.createElement('canvas');
                canvas.height = CANVAS_HEIGHT;
                canvas.width = Math.round((videoWidth / videoHeight) * CANVAS_HEIGHT);
                const context = canvas.getContext('2d');
                if (!context) return finish(null);

                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                finish(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
            } catch {
                // Tainted canvas (protocol without CORS) and other draw quirks.
                finish(null);
            }
        };

        const guard = window.setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);

        video.onerror = () => finish(null);
        video.onloadedmetadata = () => {
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            const ratioTime = duration * SEEK_RATIO;
            const time = Math.min(
                Math.max(ratioTime || SEEK_MIN_SECONDS, SEEK_MIN_SECONDS),
                SEEK_MAX_SECONDS,
                duration > 0.15 ? duration - 0.05 : SEEK_MIN_SECONDS,
            );

            video.onseeked = () => exportFrame();
            video.onseeking = () => { /* progress; seeked fires after */ };
            try {
                video.currentTime = time;
            } catch {
                finish(null);
            }
        };

        video.src = src;
    });
}
