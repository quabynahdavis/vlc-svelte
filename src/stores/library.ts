import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { settings, settingsHydrated, scopedLibraryFolders } from './settings';
import { hasTauri } from '../lib/tauriFs';
import { invokeCommand, syncLibraryAssetScope } from '../lib/tauriFs';
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

/**
 * Absolute path of the configured/scanned filesystem root the user is
 * currently navigating inside. `null` at the Library root level or when the
 * active breadcrumb is an import-derived (non-configured) group. When set, it
 * anchors the navigation scope so duplicate-named roots (same basename,
 * different absolute paths) never merge their subtrees.
 */
export const activeLibraryRootPath: Writable<string | null> = writable(null);

/** Strip a single trailing path separator for stable comparisons. */
function trimTrailingSeparator(path: string): string {
    return path.replace(/[\\/]+$/, '');
}

/**
 * True when `path` is `root` itself or lives directly beneath it. Both sides
 * are compared with a normalized trailing separator so configured roots stored
 * with or without one behave the same.
 */
export function isUnderRoot(path: string, root: string): boolean {
    const cleanRoot = trimTrailingSeparator(root);
    return (
        path.startsWith(cleanRoot) &&
        (path.length === cleanRoot.length || path[cleanRoot.length] === '/' || path[cleanRoot.length] === '\\')
    );
}

/**
 * Configured/scanned filesystem roots whose absolute path is a meaningful
 * identity (displayed as cards at the Library root). Import-derived groups use
 * a display name as their `path` and are not included.
 */
function configuredRootIdentities(): LibraryFolder[] {
    return get(rootFolders).filter((folder) => /[\\/]/.test(folder.path));
}

/** Parent folder segment of a path, used for `Name[ParentName]` disambiguation. */
function parentSegmentOf(path: string): string {
    const parts = trimTrailingSeparator(path).split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 2] ?? '';
}

/**
 * Resolve a typed root segment that may carry a `[ParentName]` disambiguator
 * (matching LibraryView's display-only label) to a configured root. Plain
 * names resolve to the unique match, or the first configured root in stable
 * rootFolders order when still ambiguous.
 */
function resolveConfiguredRootSegment(
    segment: string,
    roots: LibraryFolder[],
): LibraryFolder | undefined {
    const bracket = /^(.*)\[([^\]]+)\]$/.exec(segment.trim());
    if (bracket) {
        const nameKey = segmentKey(bracket[1]);
        const parentKey = segmentKey(bracket[2]);
        return roots.find(
            (folder) => segmentKey(folder.name) === nameKey && segmentKey(parentSegmentOf(folder.path)) === parentKey,
        );
    }

    const key = segmentKey(segment);
    return roots.find((folder) => segmentKey(folder.name) === key);
}

/**
 * Set breadcrumb segments and the matching root-path identity together. A
 * configured/scanned root at depth 1 anchors `activeLibraryRootPath`; an
 * import-derived group or the Library root leaves it `null`.
 */
function setNavigation(segments: string[], rootPath: string | null): void {
    activeLibraryRootPath.set(segments.length === 0 ? null : rootPath);
    breadcrumb.set(segments);
}

/**
 * Slice the breadcrumb to `depth` segments (0 = Library root). Clears the
 * active root identity when returning to the Library root so no stale scope
 * survives. Rendered breadcrumb index 0 is the Library label, 1 is the first
 * segment, etc., so callers pass the rendered index as `depth`.
 */
export function navigateBreadcrumbToDepth(depth: number): void {
    const next = Math.max(0, depth);
    if (next === 0) {
        setNavigation([], null);
        return;
    }
    const current = get(breadcrumb);
    // For depth >= 1 keep the already-anchored active root identity; only the
    // breadcrumb slices. Rendered index 1 = first segment = configured root.
    breadcrumb.set(current.slice(0, next));
}

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
    /** Optional id of a media item whose frame represents this folder card. */
    representativeId?: string;
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

/**
 * Pick the item whose frame represents a folder card: the first direct child
 * (shallowest depth) of `inside`, falling back to the first list entry.
 */
function pickRepresentative(inside: MediaItem[], directDepth: number): string | undefined {
    const direct = inside.find(
        (item) => relativeParts(item).length === directDepth && Boolean(item.src),
    );
    return (direct ?? inside[0])?.id;
}

/** All media items: concat of imported + scanned. */
const allItems: Readable<MediaItem[]> = derived(
    [importedItems, scannedItems],
    ([$imported, $scanned]) => [...$imported, ...$scanned],
);

/** Every item in the tree (details lookup, continue-watching style lists). */
export const libraryItems: Readable<MediaItem[]> = allItems;

/** Media folders at the active level, after the Library root label. */
export const subfolders: Readable<LibraryFolder[]> = derived(
    [allItems, breadcrumb, activeLibraryRootPath],
    ([$items, $segments, $rootPath]) => {
        if ($segments.length === 0) return [];

        const memberOfScope = (item: MediaItem): boolean =>
            $rootPath === null ? true : isUnderRoot(item.id, $rootPath);

        const order: string[] = [];
        const seen = new Set<string>();

        for (const item of $items) {
            if (!memberOfScope(item)) continue;
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
            const inside = $items.filter((item) => {
                if (!memberOfScope(item)) return false;
                return relativeParts(item).length > chain.length && matchesChain(relativeParts(item), chain);
            });

            return {
                name,
                path: chain.join('/'),
                files: inside.filter((item) => relativeParts(item).length === chain.length + 1).length,
                total: inside.length,
                representativeId: pickRepresentative(inside, chain.length + 1),
            };
        });
    },
);

/* ---------- Address bar ---------- */

export type LibraryPathResolution =
    | { ok: true; segments: string[] }
    | { ok: false; segment: string };

/** Canonical folder names one level below `segments`, for path resolution. */
function folderNamesAt(segments: string[]): LibraryFolder[] {
    if (segments.length === 0) {
        // Return configured roots as-is (path-deduped, not name-deduped) so
        // same-named roots in different locations stay distinct cards.
        return get(rootFolders);
    }
    return get(subfolders);
}

function resolveFolderSegment(segment: string, depth: number): LibraryFolder | undefined {
    if (depth === 0) {
        const roots = configuredRootIdentities();
        const explicit = resolveConfiguredRootSegment(segment, roots);
        if (explicit) return explicit;
        // Import-derived root groups (display path is the bare segment name).
        return folderNamesAt([]).find(
            (folder) => !/[\\/]/.test(folder.path) && segmentKey(folder.name) === segmentKey(segment),
        );
    }
    return folderNamesAt(get(breadcrumb).slice(0, depth)).find(
        (folder) => segmentKey(folder.name) === segmentKey(segment),
    );
}

/**
 * Resolve a `/`-separated path typed into the library address bar.
 *
 * The trail is `Library / <configured folder> / <imported subfolders>`; the
 * leading `Library` label is optional. Segments are trimmed and empty segments
 * ignored, matching is case-insensitive and canonical casing is returned. The
 * first segment may use `Name[ParentName]` to disambiguate duplicate-named
 * configured roots (matching the card label); a plain name resolves to the
 * unique match or the first configured root in stable order when ambiguous.
 * Empty input resolves to the Library root. The whole path must exist; the
 * first unknown segment is reported without navigating.
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
        const canonical = resolveFolderSegment(requested[index], index);

        if (!canonical) return { ok: false, segment: requested[index] };
        segments.push(canonical.name);
    }

    return { ok: true, segments };
}

/**
 * Navigate the breadcrumb to a typed path. Returns the resolution so callers
 * can render an error state; the breadcrumb and active root identity only
 * change on success.
 */
export function navigateToLibraryPath(input: string): LibraryPathResolution {
    const requested = (input ?? '')
        .split(/[\\/]+/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    if (segmentKey(requested[0] ?? '') === segmentKey(libraryRootName)) requested.shift();

    if (requested.length === 0) {
        setNavigation([], null);
        return { ok: true, segments: [] };
    }

    const first = resolveFolderSegment(requested[0], 0);
    if (!first) return { ok: false, segment: requested[0] };
    const rootPath = /[\\/]/.test(first.path) ? trimTrailingSeparator(first.path) : null;

    const segments: string[] = [first.name];
    // Deeper resolution uses the current store-derived subfolders; anchor the
    // root first so scoped lookups resolve against the intended root.
    const prevRoot = get(activeLibraryRootPath);
    const prevCrumb = get(breadcrumb);
    if (segments.length > 0) setNavigation(segments, rootPath);
    try {
        for (let index = 1; index < requested.length; index += 1) {
            const canonical = folderNamesAt(segments).find(
                (folder) => segmentKey(folder.name) === segmentKey(requested[index]),
            );
            if (!canonical) {
                setNavigation(prevCrumb, prevRoot);
                return { ok: false, segment: requested[index] };
            }
            segments.push(canonical.name);
            breadcrumb.set([...segments]);
        }
    } catch (e) {
        setNavigation(prevCrumb, prevRoot);
        throw e;
    }

    setNavigation(segments, rootPath);
    return { ok: true, segments };
}

/** Drop the last breadcrumb segment (the toolbar Back button). */
export function goUpOneLevel(): void {
    const segments = get(breadcrumb);
    if (segments.length <= 1) {
        setNavigation([], null);
        return;
    }
    breadcrumb.set(segments.slice(0, -1));
}

export interface LibraryFolderRef {
    name: string;
    path: string;
}

/** Open a folder one level below the current one, anchoring root identity. */
export function openLibraryFolder(folder: LibraryFolderRef): void {
    const segments = get(breadcrumb);
    if (segments.length === 0) {
        const roots = configuredRootIdentities();
        const rootMatch = roots.find(
            (candidate) => trimTrailingSeparator(candidate.path).toLowerCase() === trimTrailingSeparator(folder.path).toLowerCase(),
        );
        if (rootMatch) {
            setNavigation([folder.name], trimTrailingSeparator(rootMatch.path));
            return;
        }
        // Import-derived group (no absolute configured/scanned root identity).
        setNavigation([folder.name], null);
        return;
    }
    breadcrumb.set([...segments, folder.name]);
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
 * Items for the active library level, file-manager style.
 *
 * At the Library root only loose items (imports with no folder info) are
 * listed — everything else lives inside a folder card. Inside a folder, only
 * its direct children are listed; files deeper in the tree belong to the
 * subfolder cards opening from the same level. Search and watched filters
 * apply within that scope.
 */
export const filteredItems: Readable<MediaItem[]> = derived(
    [allItems, breadcrumb, searchQuery, libraryWatchFilter, activeLibraryRootPath],
    ([$allItems, $breadcrumb, $searchQuery, $watchFilter, $rootPath]) => {
        const query = $searchQuery.trim().toLowerCase();
        const segments = $breadcrumb;

        return $allItems.filter((item) => {
            const parts = relativeParts(item);

            if (segments.length === 0) {
                if (parts.length !== 0) return false;
            } else if ($rootPath !== null) {
                // Navigating inside a configured/scanned root: scope by absolute
                // path so duplicate-named roots never share a subtree.
                if (!isUnderRoot(item.id, $rootPath)) return false;
                if (parts.length !== segments.length + 1 || !matchesChain(parts, segments)) return false;
            } else if (parts.length !== segments.length + 1 || !matchesChain(parts, segments)) {
                return false;
            }

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
 * Used by LibraryView at the top level (breadcrumb empty). Counts cover the
 * combined pool (imports + scans) — they share one relativePath tree layout.
 */
export const rootFolders: Readable<LibraryFolder[]> = derived(
    [settings, allItems, scanTree],
    ([$settings, $items, $scanned]) => {
        const configured: LibraryFolder[] = [];
        // Dedupe by exact path, not display name — same-named folders in
        // different locations stay distinct so the view can disambiguate them
        // with the Name[ParentName] label (display-only).
        const pathsSeen = new Set<string>();

        for (const folderPath of $settings.libraryFolders) {
            const cleanPath = folderPath.replace(/[\\/]+$/, '');
            const pathKey = cleanPath.toLowerCase();
            if (pathsSeen.has(pathKey)) continue;
            pathsSeen.add(pathKey);
            const name = rootNameFor(cleanPath);
            const inside = $items.filter((item) => isUnderRoot(item.id, cleanPath));

            configured.push({
                name,
                path: folderPath,
                files: inside.filter((item) => relativeParts(item).length === 2).length,
                total: inside.length,
                representativeId: pickRepresentative(inside, 2),
            });
        }

        // Add import-derived groups at root level (first segment not matching any configured root)
        // Same display segment = same logical folder group, so dedupe by name.
        const segmentsSeen = new Set<string>();
        for (const item of $items) {
            const parts = relativeParts(item);
            if (parts.length === 0) continue;
            const firstSegment = parts[0];
            const key = segmentKey(firstSegment);

            // Check if this first segment matches any configured root basename
            const matchesConfigured = $settings.libraryFolders.some((fp) =>
                segmentKey(rootNameFor(fp)) === key,
            );
            if (matchesConfigured) continue; // Already in configured

            if (segmentsSeen.has(key)) continue;
            segmentsSeen.add(key);

            const inside = $items.filter((candidate) => {
                const candidateParts = relativeParts(candidate);
                return candidateParts.length >= 1 && segmentKey(candidateParts[0]) === key;
            });

            configured.push({
                name: firstSegment,
                path: firstSegment, // Display path
                files: inside.filter((candidate) => relativeParts(candidate).length === 2).length,
                total: inside.length,
                representativeId: pickRepresentative(inside, 2),
            });
        }

        // Add scan-derived root folders (dedupe by path: a scanned root is
        // always the scan of a configured folder, which is already a card).
        for (const root of $scanned.roots) {
            const rootPathKey = root.rootPath.replace(/[\\/]+$/, '').toLowerCase();
            if (pathsSeen.has(rootPathKey)) continue;
            pathsSeen.add(rootPathKey);
            const name = root.rootName;
            const key = segmentKey(name);

            // Count combined-pool items whose relativePath starts with this root
            const inside = $items.filter((item) => {
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

/* ---------- Folder-chain lookup for the upload rule ---------- */

export interface FolderChainResult {
    chain: string[];
    /** Absolute configured/scanned root path anchoring the chain, or null for import-derived groups. */
    rootPath: string | null;
}

/**
 * Resolve a folder name picked by an upload/dialog flow to an existing
 * breadcrumb chain and its absolute root identity.
 *
 * The webkit folder picker exposes only a display name (no absolute path), so
 * a name matching two configured roots is inherently ambiguous. Resolution is
 * deterministic and best-effort: configured/scanned roots are checked in stable
 * order and the first match wins; a configured-root basename match is preferred
 * over a fuzzy deep descendant match (which could land in the wrong duplicate).
 * The shallowest deep match wins when several folders share the name. `null`
 * means the folder is new tree territory and an import should proceed.
 */
export function findLibraryFolderChain(name: string): FolderChainResult | null {
    const pickedKey = segmentKey(name.trim());
    if (!pickedKey) return null;

    const items = get(allItems);
    const configuredRoots = get(settings).libraryFolders.map((folderPath) => {
        const clean = trimTrailingSeparator(folderPath);
        return { rootPath: clean, rootName: rootNameFor(clean) };
    });
    const scannedRoots = get(scanTree).roots.map((root) => ({
        rootPath: trimTrailingSeparator(root.rootPath),
        rootName: root.rootName,
    }));

    // 1) The pick is itself a configured root card (stable settings order).
    for (const root of configuredRoots) {
        if (segmentKey(root.rootName) === pickedKey) {
            return { chain: [root.rootName], rootPath: root.rootPath };
        }
    }
    // 1b) The pick is itself a scanned root not already represented above.
    for (const root of scannedRoots) {
        if (segmentKey(root.rootName) === pickedKey) {
            return { chain: [root.rootName], rootPath: root.rootPath };
        }
    }

    // 2) The pick lives inside a known root, at any depth. Prefer roots in
    //    stable configured order, then scanned order; keep the shallowest match
    //    globally. parts exclude the trailing file segment, so folder positions
    //    run 1..length-2 over file-bearing chains.
    const knownRoots = [
        ...configuredRoots,
        ...scannedRoots.filter((root) => !configuredRoots.some((c) => c.rootPath.toLowerCase() === root.rootPath.toLowerCase())),
    ];
    let bestDepth = Number.POSITIVE_INFINITY;
    let best: FolderChainResult | null = null;
    for (const root of knownRoots) {
        const rootKey = segmentKey(root.rootName);
        for (const item of items) {
            const parts = relativeParts(item);
            if (parts.length < 2 || segmentKey(parts[0]) !== rootKey) continue;
            if (!isUnderRoot(item.id, root.rootPath)) continue;
            for (let index = 1; index < parts.length - 1; index += 1) {
                if (segmentKey(parts[index]) !== pickedKey) continue;
                if (index < bestDepth) {
                    bestDepth = index;
                    best = { chain: [root.rootName, ...parts.slice(1, index + 1)], rootPath: root.rootPath };
                }
                break;
            }
        }
    }
    if (best) return best;

    // 3) The pick matches an already-imported top-level group (name-based).
    for (const item of items) {
        const parts = relativeParts(item);
        if (parts.length >= 2 && segmentKey(parts[0]) === pickedKey) {
            return { chain: [parts[0]], rootPath: null };
        }
    }

    return null;
}

/** Resolve and navigate to an existing folder picked by name (e.g. webkit picker). */
export function navigateToFolderChain(name: string): FolderChainResult | null {
    const result = findLibraryFolderChain(name);
    if (!result) return null;
    setNavigation(result.chain, result.rootPath);
    return result;
}

/**
 * Handle a folder picked outside the DOM (native desktop dialog).
 *
 * Inside a configured root → navigate into it (the pick may be the root itself
 * or any deeper descendant; the breadcrumb is rebuilt from the chain between
 * root and pick). Outside every configured root → adopt the folder as a new
 * configured root, so the scanner gives it its own top-level card next to the
 * others with its subtree intact.
 */
export async function importLibraryFolderPath(
    absolutePath: string,
): Promise<'navigated' | 'adopted'> {
    const target = absolutePath.replace(/[\\/]+$/, '');
    const targetKey = target.toLowerCase();
    const roots = get(settings).libraryFolders;

    for (const rootPath of roots) {
        const clean = rootPath.replace(/[\\/]+$/, '');
        const cleanKey = clean.toLowerCase();
        const sameOrInside =
            targetKey === cleanKey ||
            targetKey.startsWith(`${cleanKey}/`) ||
            targetKey.startsWith(`${cleanKey}\\`);

        if (!sameOrInside) continue;

        const rootName = rootNameFor(clean);
        const rest = target.slice(clean.length).replace(/^[\\/]+/, '');
        const segments = rest.length > 0 ? rest.split(/[\\/]+/).filter(Boolean) : [];
        setNavigation([rootName, ...segments], clean);
        return 'navigated';
    }

    settings.update((s) => ({
        ...s,
        libraryFolders: s.libraryFolders.some((f) => f.toLowerCase() === targetKey)
            ? s.libraryFolders
            : [...s.libraryFolders, target],
    }));
    return 'adopted';
}

/* ---------- Bootstrap & Tauri integration ---------- */

/**
 * Probe durations for scanned items using Rust ffprobe via Tauri command.
 * Falls back to browser video probe for items with a src (imported blob URLs).
 */
async function probeDurationsForScanned(items: MediaItem[]): Promise<void> {
    for (const item of items) {
        // For Tauri desktop, use Rust ffprobe via media_duration
        if (hasTauri()) {
            const seconds = await invokeCommand<number | null>('media_duration', { path: item.id })
                .catch(() => null);
            if (seconds !== null && seconds > 0) {
                updateLibraryItemDuration(item.id, seconds);
            }
        }

        // For browser sessions or non-Tauri environments, fallback to video element
        const src = item.src;
        if (src && !hasTauri()) {
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
}

/** Playback progress (0..1) recorded for a scanned file path, or 0. */
function watchProgressFor(path: string): number {
    const entry = get(watchEntries).find((w) => w.mediaKey === path && w.type === 'video');
    if (!entry) return 0;
    if (entry.watched) return 1;
    return entry.duration > 0 ? Math.min(1, entry.position / entry.duration) : 0;
}

/**
 * Scan one configured root and replace its previous results. Shared by the
 * startup/reactive scans and the explicit per-root rescan.
 */
function scanSingleRoot(rootPath: string, includeHidden: boolean): void {
    void invokeCommand<ScanResult>('scan_library_dir', { root: rootPath, maxDepth: 4, includeHidden })
        .then(async (scanResult) => {
            if (!scanResult) return;

            // Convert ScannedFile -> MediaItem; root basename leads the chain
            // so imports and scans share one tree layout.
            const rootBasename = scanResult.root;
            const mediaItems: MediaItem[] = await Promise.all(
                scanResult.files.map(async (file): Promise<MediaItem> => {
                    const rel = file.relativePath ?? '';
                    const parts = rel.split('/').filter(Boolean);
                    return {
                        id: file.path,
                        title: file.name,
                        season: 1,
                        episode: 0,
                        durationSeconds: 0,
                        progress: watchProgressFor(file.path),
                        src: (await toFileSrc(file.path)) ?? '',
                        relativePath: [rootBasename, ...parts].join('/'),
                    };
                }),
            );

            // Replace this root's previous items instead of appending.
            scannedItems.update((current) => [
                ...current.filter((item) => !isUnderRoot(item.id, rootPath)),
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

/**
 * Scan all roots in settings.libraryFolders and update scannedItems/scanTree.
 * Skipped entirely when the user disabled startup scanning, unless `force` is
 * set; replaces each root's previous results so rescans never duplicate items.
 */
function scanRoots(force = false): void {
    const state = get(settings);
    if (state.scanOnStartup === false && !force) return;

    // uses shared isUnderRoot(path, root)

    for (const rootPath of state.libraryFolders) {
        scanSingleRoot(rootPath, state.includeHiddenFiles);
    }
}

/**
 * Rescan a single configured library root on demand (folder context menu).
 * Explicit rescans ignore the scanOnStartup preference because the user asked
 * for them; the call is a no-op outside the desktop shell.
 */
export function rescanLibraryRoot(rootPath: string): void {
    if (!hasTauri()) return;
    scanSingleRoot(rootPath, get(settings).includeHiddenFiles);
}

/** Settings watch that seeds the default Videos folder once, then rescans on changes. */
let bootstrapRan = false;
let lastScannedFolders = '';

settings.subscribe((newSettings) => {
    if (!hasTauri()) return;

    if (!bootstrapRan) {
        bootstrapRan = true;

        // On first run in the desktop shell, wait for settings hydration to
        // complete first. The hydration path in settings.ts syncs the
        // asset-protocol scope (allowing the configured library roots) before
        // resolving settingsHydrated, so scanning/probing never touches
        // asset:// URLs outside the allowed scope.
        void settingsHydrated.then(async () => {
            // On first run in the desktop shell, add the platform Videos folder.
            const result = await invokeCommand<string>('default_media_dir', { kind: 'videos' });
            const current = get(settings);
            const shouldSeed =
                !!result &&
                !current.libraryDefaultSeeded &&
                !current.libraryFolders.some(
                    (f) => rootNameFor(f).toLowerCase() === rootNameFor(result).toLowerCase(),
                );

            if (shouldSeed && result) {
                // Record the expected key BEFORE updating settings so the
                // synchronous subscriber callback triggered by `settings.update`
                // sees an unchanged key and does not start a second scan.
                lastScannedFolders = [...current.libraryFolders, result].join(' ');
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
        // Reactive sync: asset-protocol scope follows libraryFolders changes
        // (in addition to the subscription in settings.ts). Always pass the
        // full video + music union so video-list edits never deny music roots.
        // No-op in browser, idempotent via previous-value diff.
        void syncLibraryAssetScope(scopedLibraryFolders(newSettings));
        scanRoots();
    }
});