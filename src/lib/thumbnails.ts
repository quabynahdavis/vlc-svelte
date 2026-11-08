/**
 * Video frame thumbnails for the library.
 *
 * Captures are made client-side: a detached <video> loads the item's media
 * source (blob URLs for imports, the Tauri asset protocol for scanned files),
 * seeks a little into the film, draws a frame to a canvas and exports a small
 * JPEG data URL. Results live in `mediaThumbnails` keyed by item id.
 *
 * Deliberately NOT persisted: the map is a session cache, regenerated lazily
 * when cards mount, so stored settings/items never carry megabytes of frames.
 * Failed captures are remembered for the session and stay placeholders.
 */
import { writable, type Readable } from 'svelte/store';
import type { MediaItem } from './mock';

/** JPEG quality / target height for exported frames. */
const JPEG_QUALITY = 0.72;
const CANVAS_HEIGHT = 240;
/** Capture a frame this far into the film (8% of duration, capped). */
const SEEK_RATIO = 0.08;
const SEEK_MIN_SECONDS = 0.1;
const SEEK_MAX_SECONDS = 45;
/** Watchdog so a hanging decode never blocks the queue forever. */
const CAPTURE_TIMEOUT_MS = 9000;
/** Parallel <video> decodes; more is not faster for codec threads. */
const MAX_CONCURRENT = 2;

/** Extension filter — thumbnails are for video files only. */
const VIDEO_EXTENSION = /\.(mp4|m4v|mkv|webm|mov|avi|ogv|ts|m2ts|mpe?g)$/i;

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

/**
 * Queue a thumbnail for `item` (no-op when one exists, is pending, or the
 * attempt failed earlier this session). Safe to call from every rendered card.
 */
export function ensureItemThumbnail(item: MediaItem): void {
    const src = item.src;
    if (!src) return;
    if (content.has(item.id) || pending.has(item.id) || failed.has(item.id)) return;
    if (!VIDEO_EXTENSION.test(item.title) && !/\.(mp4|m4v|mkv|webm|mov|avi|ogv)$/i.test(src)) return;

    pending.set(item.id, src);
    items.set(item.id, item);
    queue.push(item.id);
    pump();
}

function pump(): void {
    while (inflight < MAX_CONCURRENT && queue.length > 0) {
        const id = queue.shift();
        const src = id ? pending.get(id) : undefined;
        if (!id || !src) {
            if (id) pending.delete(id);
            continue;
        }

        inflight += 1;
        void capture(src)
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
