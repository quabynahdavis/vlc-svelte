import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import type { MediaItem } from '../lib/mock';
import { settings } from './settings';

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
/* Folder tree                                                       */
/* ---------------------------------------------------------------- */

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

/**
 * Every imported media item lives flat in this store; the folder tree is
 * derived from each item's `relativePath` (`webkitRelativePath` captured by
 * Add folder imports) against the folders configured in Settings > Library.
 */
const importedItems: Writable<MediaItem[]> = writable([]);

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
  [settings, importedItems],
  ([$settings, $items]) => {
    const folders: LibraryFolder[] = [];
    const seen = new Set<string>();

    for (const folderPath of $settings.libraryFolders) {
      const name = rootNameFor(folderPath);
      const key = segmentKey(name);
      if (seen.has(key)) continue;
      seen.add(key);

      const parts = folderPath.split(/[\\/]+/).filter(Boolean);
      const root = parts[parts.length - 1]?.toLowerCase() ?? '';
      const inside = $items.filter((item) =>
        matchesChain(relativeParts(item), root ? [root] : []),
      );

      folders.push({
        name,
        path: folderPath,
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

/** Media files listed in the active folder (imports that live above it stay hidden). */
const currentItems: Readable<MediaItem[]> = derived(
  [importedItems, breadcrumb, settings],
  ([$items, $segments, $settings]) => {
    if ($segments.length === 0) {
      // Library root: loose imports plus anything imported from unknown folders.
      const roots = new Set(
        $settings.libraryFolders
          .map((folderPath) => segmentKey(rootNameFor(folderPath)))
          .filter(Boolean),
      );

      return $items.filter((item) => {
        const parts = relativeParts(item);
        return parts.length === 0 || !roots.has(segmentKey(parts[0]));
      });
    }

    return $items.filter((item) => {
      const parts = relativeParts(item);
      return parts.length === $segments.length + 1 && matchesChain(parts, $segments);
    });
  },
);

/** Items in the current folder. Future phases can swap this when opening a folder. */
export const libraryItems: Readable<MediaItem[]> = currentItems;

/* ---------- Address bar ---------- */

export type LibraryPathResolution =
  | { ok: true; segments: string[] }
  | { ok: false; segment: string };

/** Canonical folder names one level below `segments`, for path resolution. */
function folderNamesAt(segments: string[]): LibraryFolder[] {
  const configured = segments.length === 0 ? get(libraryFolders) : [];
  const nested = get(subfolders);
  return [...configured, ...nested];
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
  importedItems.update((items) =>
    items.map((item) =>
      item.id === id ? { ...item, progress: isItemWatched(item) ? 0 : 1 } : item,
    ),
  );
}

/**
 * Case-insensitive title filter plus the watched-state filter, used by the
 * library grid, the toolbar count and the empty states.
 */
export const filteredItems: Readable<MediaItem[]> = derived(
  [currentItems, searchQuery, libraryWatchFilter],
  ([$currentItems, $searchQuery, $watchFilter]) => {
    const query = $searchQuery.trim().toLowerCase();

    return $currentItems.filter((item) => {
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
}
