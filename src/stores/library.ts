import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { settings } from './settings';
import { hasTauri } from '../lib/tauriFs';
import { invokeCommand } from '../lib/tauriFs';
import { toFileSrc } from '../lib/tauriFs';
import { upsertWatch, watchEntries } from './watch';
import type { MediaItem, ScannedFile, ScannedFolder, ScanResult } from '../lib/mock';

/**
 * Fixed label for the topmost library level. It is only shown in the
 * breadcrumb/address bar; the breadcrumb state itself stores the folder
 * segments *below* it (empty array = the Library root).
 */
export const libraryRootName = 'Library';

/** Breadcrumb trail of the current folder, excluding the Library root label. */
export const breadcrumb: Writable<string[]> = writable([]);

/** Raw search box contents, shared so later phases can layer on other filters. */
export const searchQuery: Writable<string> = writable('');

/* ---------------------------------------------------------------- */
/* Store items                                                       */
/* ---------------------------------------------------------------- */

/** Media items that were imported via the file/folder picker. */
const importedItems: Writable<MediaItem[]> = writable([]);

/** Media items that were scanned from the filesystem via Tauri. */
const scannedItems: Writable<MediaItem[]> = writable([]);

/** Scan tree from Tauri scans: roots and their status. */
export const scanTree: Writable<{
    roots: { rootPath: string; rootName: string; result: ScanResult }[];
    ready: boolean;
}> = writable({ roots: [], ready: false });

/* ---------------------------------------------------------------- */
/* Folder tree                                                       */

/** A folder shown in the library: a configured root or an imported subfolder. */
export interface LibraryFolder {
    /** Breadcrumb/display name (base name of the configured path). */
    name: string;
    /** Full path: the configured folder for roots, the display path for subfolders. */
    path: string;
    /** Media files directly inside this folder. */
    files: number;
    /** Media files inside including nested subfolders. */
    total: number;
}

/** Merge two LibraryFolder arrays, deduping by display name. */
function mergeFolders(a: LibraryFolder[], b: LibraryFolder[]): LibraryFolder[] {
    const seen = new Set<string>();
    const result: LibraryFolder[] = [];

    const pushIfNew = (folder: LibraryFolder) => {
        const key = folder.name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(folder);
    };

    for (const f of a) pushIfNew(f);
    for (const f of b) pushIfNew(f);

    return result;
}

/** Split a relative path into its non-empty folder segments. */
function relativeParts(item: MediaItem): string[] {
    return (item.relativePath ?? '').split(/[\\/]+/).filter(Boolean);
}

function segmentKey(segment: string): string {
    return segment.toLowerCase();
}

/** True when the item's folder chain matches the breadcrumb segments. */
function matchesChain(parts: string[], segments: string[]): boolean {
    return segments.every((segment, index) => segmentKey(parts[index] ?? '') === segmentKey(segment));
}

/** Display name (base name) of a configured folder path. */
function rootNameFor(folderPath: string): string {
    const parts = folderPath.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] ?? folderPath;
}

/** Folder names configured in Settings, deduped per display name, in order. */
export const libraryFolders: Readable<LibraryFolder[]> = derived(
    [settings, importedItems, scannedItems],
    ([$settings, $imported, $scanned]) => {
        const folders: LibraryFolder[] = [];
        const seen = new Set<string>();

        for (const folderPath of $settings.libraryFolders) {
            const name = rootNameFor(folderPath);
            const key = segmentKey(name);
            if (seen.has(key)) continue;
            seen.add(key);

            const parts = folderPath.split(/[\\/]+/).filter(Boolean);
            const root = parts[parts.length - 1]?.toLowerCase() ?? '';
            const inside = $imported.filter((item) =>
                matchesChain(relativeParts(item), root ? [root] : []),
            );

            folders.push({
                name,
                path: folderPath,
                files: inside.filter((item) => relativeParts(item).length === 1).length,
                total: inside.length,
            });
        }

        // Add scan-derived folders (first segment matches a scanned root)
        const scanRoots = get(scanTree).roots;
        for (const root of scanRoots) {
            const name = root.rootName;
            const key = segmentKey(name);
            if (seen.has(key)) continue;
            seen.add(key);

            const inside = $imported.filter((item) => {
                const parts = relativeParts(item);
                return parts.length >= 1 && segmentKey(parts[0]) === key;
            });

            folders.push({
                name,
                path: root.rootPath,
                files: inside.filter((item) => relativeParts(item).length === 1).length,
                total: inside.length,
            });
        }

        return folders;
    },
);

/** Media folders at the active level, after the Library root label. */
export const subfolders: Readable<LibraryFolder[]> = derived(
    [importedItems, breadcrumb],
    ([$items, $segments]) => {
        if ($segments.length === 0) return [];

        const order: string[] = [];
        const seen = new Set<string>();

        for (const item of $items) {
            const parts = relativeParts(item);
            if (parts.length <= $segments.length + 1 || !matchesChain(parts, $segments)) continue;

            const name = parts[$segments.length];
            const key = segmentKey(name);
            if (!seen.has(key)) {
                seen.add(key);
                order.push(name);
            }
        }

        return order.map((name) => {
            const chain = [...$segments, name];
            const inside = $items.filter(
                (item) => relativeParts(item).length > chain.length && matchesChain(relativeParts(item), chain),
            );

            return {
                name,
                path: chain.join('/'),
                files: inside.filter((item) => relativeParts(item).length === chain.length + 1).length,
                total: inside.length,
            };
        });
    },
);

/** All media items: concat of imported + scanned. */
const allItems: Readable<MediaItem[]> = derived(
    [importedItems, scannedItems],
    ([$imported, $scanned]) => [...$imported, ...$scanned],
);

/** Items in the current folder. */
export const libraryItems: Readable<MediaItem[]> = allItems;

/* ---------- Address bar ---------- */

export type LibraryPathResolution =
    | { ok: true; segments: string[] }
    | { ok: false; segment: string };

/** Canonical folder names one level below `segments`, for path resolution. */
function folderNamesAt(segments: string[]): LibraryFolder[] {
    const configured = segments.length === 0 ? get(libraryFolders) : [];
    const nested = get(subfolders);
    return mergeFolders(configured, nested);
}

/**
 * Resolve a `/`-separated path typed into the library address bar.
 *
 * The trail is `Library / <configured folder> / <imported subfolders>`; the
 * leading `Library` label is optional. Segments are trimmed and empty segments
 * ignored so `Videos/Shows` and `videos//shows` resolve the same way, matching
 * is case-insensitive and canonical casing is returned. Empty input resolves to
 * the Library root. The whole path must exist; the first unknown segment is
 * reported so the caller can show an error without navigating.
 */
export function resolveLibraryPath(input: string): LibraryPathResolution {
    const requested = (input ?? '')
        .split(/[\\/]+/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    if (segmentKey(requested[0] ?? '') === segmentKey(libraryRootName)) requested.shift();

    if (requested.length === 0) return { ok: true, segments: [] };

    const segments: string[] = [];

    for (let index = 0; index < requested.length; index += 1) {
        const canonical = folderNamesAt(segments).find(
            (folder) => segmentKey(folder.name) === segmentKey(requested[index]),
        );

        if (!canonical) return { ok: false, segment: requested[index] };
        segments.push(canonical.name);
    }

    return { ok: true, segments };
}

/**
 * Navigate the breadcrumb to a typed path. Returns the resolution so callers
 * can render an error state; the breadcrumb only changes on success.
 */
export function navigateToLibraryPath(input: string): LibraryPathResolution {
    const result = resolveLibraryPath(input);
    if (result.ok) breadcrumb.set(result.segments);
    return result;
}

/** Drop the last breadcrumb segment (the toolbar Back button). */
export function goUpOneLevel(): void {
    breadcrumb.update((segments) => segments.slice(0, -1));
}

/** Open a folder one level below the current one. */
export function openLibraryFolder(name: string): void {
    breadcrumb.update((segments) => [...segments, name]);
}

/** Latest human-readable import status shown under the toolbar. */
export const libraryImportLog: Writable<string> = writable('');

/**
 * Watched-state filter.
 *
 * An item counts as watched as soon as playback progress is above zero, which
 * matches when the cards and rows start drawing their progress bar. There is no
 * separate "finished" threshold, so a partly watched item is still watched.
 */
export type LibraryWatchFilter = 'all' | 'unwatched' | 'watched';

export const libraryWatchFilter: Writable<LibraryWatchFilter> = writable('all');

/** True when an item has any playback progress. Shared by filtering and sorting. */
export function isItemWatched(item: MediaItem): boolean {
    return item.progress > 0;
}

/**
 * Flip an item's watched state using the same progress-based definition as
 * {@link isItemWatched}: watched items drop back to zero progress, unwatched
 * items are marked as fully watched. Unknown ids are ignored.
 */
export function toggleItemWatched(id: string): void {
    // Check if this id belongs to a scanned item
    const scannedList = get(scannedItems);
    const scannedItem = scannedList.find((i) => i.id === id);

    if (scannedItem !== undefined) {
        // Update scanned item progress and upsert watch entry
        scannedItems.update((items) =>
            items.map((item) =>
                item.id === id ? { ...item, progress: isItemWatched(item) ? 0 : 1 } : item,
            ),
        );

        // Upsert watch entry with mediaKey=id, type='video', title from item
        upsertWatch({
            mediaKey: id,
            type: 'video',
            title: scannedItem.title,
            duration: scannedItem.durationSeconds ?? 0,
            position: isItemWatched(scannedItem) ? 0 : 1,
        });
    } else {
        // Update imported item (existing logic)
        importedItems.update((items) =>
            items.map((item) =>
                item.id === id ? { ...item, progress: isItemWatched(item) ? 0 : 1 } : item,
            ),
        );
    }
}

/**
 * Case-insensitive title filter plus the watched-state filter, used by the
 * library grid, the toolbar count and the empty states.
 */
export const filteredItems: Readable<MediaItem[]> = derived(
    [allItems, searchQuery, libraryWatchFilter],
    ([$allItems, $searchQuery, $watchFilter]) => {
        const query = $searchQuery.trim().toLowerCase();

        return $allItems.filter((item) => {
            if (query && !item.title.toLowerCase().includes(query)) return false;
            if ($watchFilter === 'unwatched') return !isItemWatched(item);
            if ($watchFilter === 'watched') return isItemWatched(item);
            return true;
        });
    },
);

/** Columns offered by the library sort menu. */
export type LibrarySortKey = 'title' | 'duration' | 'progress' | 'episode' | 'watched';
export type SortDirection = 'asc' | 'desc';

export const librarySortKey: Writable<LibrarySortKey> = writable('episode');
export const librarySortDirection: Writable<SortDirection> = writable('asc');

const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * `filteredItems` reordered by the active sort key.
 *
 * Ties fall back to the original position so the order is stable in both
 * directions, and text comparisons ignore case. For the `watched` key,
 * ascending puts unwatched items first and descending puts watched items first.
 */
export const sortedItems: Readable<MediaItem[]> = derived(
    [filteredItems, librarySortKey, librarySortDirection],
    ([$filteredItems, $sortKey, $sortDirection]) => {
        const direction = $sortDirection === 'asc' ? 1 : -1;

        return $filteredItems
            .map((item, index) => ({ item, index }))
            .sort((a, b) => {
                let comparison = 0;

                switch ($sortKey) {
                    case 'title':
                        comparison = titleCollator.compare(a.item.title, b.item.title);
                        break;
                    case 'duration':
                        comparison = a.item.durationSeconds - b.item.durationSeconds;
                        break;
                    case 'progress':
                        comparison = a.item.progress - b.item.progress;
                        break;
                    case 'episode':
                        comparison = a.item.episode - b.item.episode;
                        break;
                    case 'watched':
                        comparison = Number(isItemWatched(a.item)) - Number(isItemWatched(b.item));
                        break;
                }

                if (comparison === 0) return a.index - b.index;
                return comparison * direction;
            })
            .map(({ item }) => item);
    },
);

/* ---------- Imports ---------- */

/**
 * Item shape accepted by {@link addImportedItems}. `relativePath` keeps the
 * folder chain captured by folder imports (`webkitRelativePath`) so imported
 * media slots into the configured folder tree. Season and episode are assigned
 * by the store so every import lands after the existing items.
 */
export type LibraryImportEntry = Pick<
    MediaItem,
    'id' | 'title' | 'durationSeconds' | 'progress' | 'src' | 'thumbnailPath'
> & { relativePath?: string };

let importSequence = 0;

/** Stable unique id for imported media, with a counter fallback without crypto.randomUUID. */
export function createLibraryItemId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `import-${crypto.randomUUID()}`;
    }

    importSequence += 1;
    return `import-${Date.now().toString(36)}-${importSequence}`;
}

/** Append imported items, assigning `season: 1` and the next free episode numbers. */
export function addImportedItems(entries: LibraryImportEntry[]): number {
    if (entries.length === 0) return 0;

    importedItems.update((items) => {
        let nextEpisode = items.reduce((highest, item) => Math.max(highest, item.episode), 0) + 1;

        const additions = entries.map<MediaItem>((entry) => ({
            ...entry,
            season: 1,
            episode: nextEpisode++,
        }));

        return [...items, ...additions];
    });

    return entries.length;
}

/** Apply a duration discovered by the metadata probe; ignores items that no longer exist. */
export function updateLibraryItemDuration(id: string, durationSeconds: number): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

    importedItems.update((items) =>
        items.map((item) =>
            item.id === id ? { ...item, durationSeconds: Math.round(durationSeconds) } : item,
        ),
    );
    scannedItems.update((items) =>
        items.map((item) =>
            item.id === id ? { ...item, durationSeconds: Math.round(durationSeconds) } : item,
        ),
    );
}

/* ---------- Root folders for view ---------- */

/**
 * rootFolders: union of configured roots + import-derived groups at root level.
 * Used by LibraryView at the top level (breadcrumb empty).
 */
export const rootFolders: Readable<LibraryFolder[]> = derived(
    [settings, importedItems, scanTree],
    ([$settings, $imported, $scanned]) => {
        const configured: LibraryFolder[] = [];
        const seen = new Set<string>();

        for (const folderPath of $settings.libraryFolders) {
            const name = rootNameFor(folderPath);
            const key = segmentKey(name);
            if (seen.has(key)) continue;
            seen.add(key);

            const parts = folderPath.split(/[\\/]+/).filter(Boolean);
            const root = parts[parts.length - 1]?.toLowerCase() ?? '';
            const inside = $imported.filter((item) =>
                matchesChain(relativeParts(item), root ? [root] : []),
            );

            configured.push({
                name,
                path: folderPath,
                files: inside.filter((item) => relativeParts(item).length === 1).length,
                total: inside.length,
            });
        }

        // Add import-derived groups at root level (first segment not matching any configured root)
        for (const item of $imported) {
            const parts = relativeParts(item);
            if (parts.length === 0) continue;
            const firstSegment = parts[0];
            const key = segmentKey(firstSegment);

            // Check if this first segment matches any configured root basename
            const matchesConfigured = $settings.libraryFolders.some((fp) =>
                segmentKey(rootNameFor(fp)) === key,
            );
            if (matchesConfigured) continue; // Already in configured

            if (seen.has(key)) continue;
            seen.add(key);

            configured.push({
                name: firstSegment,
                path: firstSegment, // Display path
                files: 1,
                total: 1,
            });
        }

        // Add scan-derived root folders
        for (const root of $scanned.roots) {
            const name = root.rootName;
            const key = segmentKey(name);
            if (seen.has(key)) continue;
            seen.add(key);

            // Count imported items whose relativePath starts with this root
            const inside = $imported.filter((item) => {
                const parts = relativeParts(item);
                return parts.length >= 1 && segmentKey(parts[0]) === key;
            });

            configured.push({
                name,
                path: root.rootPath,
                files: inside.filter((item) => relativeParts(item).length === 1).length,
                total: inside.length,
            });
        }

        return configured;
    },
);

/* ---------- currentFolders using rootFolders at root ---------- */
export const currentFolders: Readable<LibraryFolder[]> = derived(
    [breadcrumb, rootFolders, subfolders],
    ([$breadcrumb, $rootFolders, $subfolders]) => {
        if ($breadcrumb.length === 0) {
            // At library root: use rootFolders (configured + import-derived + scan-derived)
            return $rootFolders;
        }
        // Deeper levels: use subfolders
        return $subfolders;
    },
);

/* ---------- findScannedSubfolder ---------- */

/**
 * Export helper: find a scanned root or its direct subfolder by name.
 * Returns breadcrumb segments (or null) if matched.
 */
export function findScannedSubfolder(name: string): string[] | null {
    const scannedRoots = get(scanTree).roots;

    // Check if name matches a scanned root's rootName
    for (const root of scannedRoots) {
        if (root.rootName.toLowerCase() === name.toLowerCase()) {
            return []; // Return empty segments - the root itself
        }
    }

    // Check if name matches a direct subfolder of a scanned root
    // The root's relativePath segments would be [rootName]
    // A direct subfolder would have relativePath = [rootName, subfolderName]
    const items = get(allItems);
    for (const root of scannedRoots) {
        // If the breadcrumb is just [rootName], opening a subfolder would add another segment
        // We need to check if any item's relativePath starts with [rootName, name]
        for (const item of items) {
            const parts = relativeParts(item);
            if (parts.length >= 2 && segmentKey(parts[0]) === segmentKey(root.rootName) && segmentKey(parts[1]) === segmentKey(name)) {
                return [root.rootName, name];
            }
        }
    }

    return null;
}

/* ---------- Bootstrap & Tauri integration ---------- */

/**
 * Probe durations for scanned items by creating <video> elements.
 */
async function probeDurationsForScanned(items: MediaItem[]): Promise<void> {
    for (const item of items) {
        const src = item.src;
        if (!src) continue;

        const video = document.createElement('video');
        video.preload = 'metadata';

        await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    updateLibraryItemDuration(item.id, video.duration);
                }
                resolve();
            };
            video.onerror = () => resolve();
            video.src = src;
        });
    }
}

/**
 * Scan all roots in settings.libraryFolders and update scannedItems/scanTree.
 * Skipped entirely when the user disabled startup scanning; replaces each
 * root's previous results so rescans never duplicate items.
 */
function scanRoots(): void {
    const state = get(settings);
    if (state.scanOnStartup === false) return;

    const roots = state.libraryFolders;
    const includeHidden = state.includeHiddenFiles;
    const currentWatch = get(watchEntries);
    const progressFor = (path: string): number => {
        const entry = currentWatch.find((w) => w.mediaKey === path && w.type === 'video');
        if (!entry) return 0;
        if (entry.watched) return 1;
        return entry.duration > 0 ? Math.min(1, entry.position / entry.duration) : 0;
    };

    /** True when `path` is `root` itself or lives directly beneath it (either separator). */
    const underRoot = (path: string, root: string): boolean =>
        path.startsWith(root) &&
        (path.length === root.length || path[root.length] === '/' || path[root.length] === '\\');

    for (const rootPath of roots) {
        void invokeCommand<ScanResult>('scan_library_dir', { root: rootPath, maxDepth: 4, includeHidden })
            .then(async (scanResult) => {
                if (!scanResult) return;

                // Convert ScannedFile -> MediaItem; root basename leads the chain
                // so imports and scans share one tree layout.
                const rootBasename = scanResult.root;
                const mediaItems: MediaItem[] = await Promise.all(
                    scanResult.files.map(async (file): Promise<MediaItem> => {
                        const parts = file.relative_path.split('/').filter(Boolean);
                        return {
                            id: file.path,
                            title: file.name,
                            season: 1,
                            episode: 0,
                            durationSeconds: 0,
                            progress: progressFor(file.path),
                            src: (await toFileSrc(file.path)) ?? '',
                            relativePath: [rootBasename, ...parts].join('/'),
                        };
                    }),
                );

                // Replace this root's previous items instead of appending.
                scannedItems.update((current) => [
                    ...current.filter((item) => !underRoot(item.id, rootPath)),
                    ...mediaItems,
                ]);

                scanTree.update((tree) => ({
                    roots: [
                        ...tree.roots.filter((r) => r.rootPath !== rootPath),
                        { rootPath, rootName: rootBasename, result: scanResult },
                    ],
                    ready: true,
                }));

                // Probe durations in background
                void probeDurationsForScanned(mediaItems);
            })
            .catch((e) => {
                console.warn(`Scan failed for ${rootPath}:`, e);
            });
    }
}

/** Settings watch that seeds the default Videos folder once, then rescans on changes. */
let bootstrapRan = false;
let lastScannedFolders = '';

settings.subscribe((newSettings) => {
    if (!hasTauri()) return;

    if (!bootstrapRan) {
        bootstrapRan = true;

        // On first run in the desktop shell, add the platform Videos folder.
        void invokeCommand<string>('default_media_dir', { kind: 'videos' }).then((result) => {
            const current = get(settings);
            if (
                result &&
                !current.libraryDefaultSeeded &&
                !current.libraryFolders.some(
                    (f) => rootNameFor(f).toLowerCase() === rootNameFor(result).toLowerCase(),
                )
            ) {
                settings.update((s) => ({
                    ...s,
                    libraryFolders: [...s.libraryFolders, result],
                    libraryDefaultSeeded: true,
                }));
            }

            lastScannedFolders = get(settings).libraryFolders.join(' ');
            scanRoots();
        });
        return;
    }

    const foldersKey = newSettings.libraryFolders.join(' ');
    if (foldersKey !== lastScannedFolders) {
        lastScannedFolders = foldersKey;
        scanRoots();
    }
});