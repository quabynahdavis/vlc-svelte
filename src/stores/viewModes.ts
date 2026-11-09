/**
 * Per-view layout preferences (grid / list / compact).
 *
 * Every scope is stored in one versioned JSON object under
 * `vlc.viewModes.v1`. Persisted data is treated as untrusted: each scope is
 * validated independently and falls back to its default when malformed.
 * Storage access is wrapped so private mode, disabled storage, or SSR simply
 * degrade to in-memory defaults.
 */
import { writable, type Writable } from 'svelte/store';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { hasTauri } from '../lib/tauriFs';

export type ViewMode = 'grid' | 'list' | 'compact';

/** Areas of the app that expose a layout switcher. */
export type ViewModeScope = 'library' | 'music' | 'playlists' | 'recent' | 'network';

export type ViewModeIcon = 'layout-grid' | 'list' | 'rows-3';

export interface ViewModeOption {
  value: ViewMode;
  /** Short label for menus or accessible text. */
  label: string;
  /** Tooltip / accessible name for an icon-only control. */
  title: string;
  /** Icon key resolved by the consuming control. */
  icon: ViewModeIcon;
}

/** Bump the version suffix when the persisted shape changes. */
export const VIEW_MODES_STORAGE_KEY = 'vlc.viewModes.v1';

const VIEW_MODE_VALUES: readonly ViewMode[] = ['grid', 'list', 'compact'];

export const viewModeOptions: readonly ViewModeOption[] = [
  { value: 'grid', label: 'Grid', title: 'Grid view', icon: 'layout-grid' },
  { value: 'list', label: 'List', title: 'List view', icon: 'list' },
  { value: 'compact', label: 'Compact', title: 'Compact view', icon: 'rows-3' },
];

export const viewModeDefaults: Readonly<Record<ViewModeScope, ViewMode>> = {
  library: 'grid',
  music: 'grid',
  playlists: 'list',
  recent: 'list',
  network: 'grid',
};

const VIEW_MODE_SCOPES: readonly ViewModeScope[] = [
  'library',
  'music',
  'playlists',
  'recent',
  'network',
];

type ViewModeState = Record<ViewModeScope, ViewMode>;

/** Narrow an unknown value (typically parsed JSON) to a supported mode. */
export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VIEW_MODE_VALUES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultModes(): ViewModeState {
  return { ...viewModeDefaults };
}

function sanitizeModes(value: unknown): ViewModeState {
  const modes = defaultModes();
  if (!isRecord(value)) return modes;

  for (const scope of VIEW_MODE_SCOPES) {
    if (!Object.prototype.hasOwnProperty.call(value, scope)) continue;
    const candidate = value[scope];
    if (isViewMode(candidate)) modes[scope] = candidate;
  }

  return modes;
}

function loadModes(): ViewModeState {
  // Desktop shell: start from defaults; the snapshot is applied by the boot
  // hydration. Browser preview keeps the direct localStorage read.
  if (hasTauri()) return defaultModes();

  try {
    const raw = window.localStorage.getItem(VIEW_MODES_STORAGE_KEY);
    if (raw === null) return defaultModes();
    return sanitizeModes(JSON.parse(raw) as unknown);
  } catch {
    return defaultModes();
  }
}

/** Latest known values for every scope, mirrored from the public stores. */
const modes: ViewModeState = loadModes();

const writeModes = createKeyWriter(VIEW_MODES_STORAGE_KEY);

function persistModes(): void {
  void writeModes(JSON.stringify(modes));
}

function createViewModeStore(scope: ViewModeScope): Writable<ViewMode> {
  const store = writable<ViewMode>(modes[scope]);

  store.subscribe((mode) => {
    // The initial subscription sees the loaded value; only persist changes.
    if (!isViewMode(mode) || modes[scope] === mode) return;
    modes[scope] = mode;
    persistModes();
  });

  return store;
}

export const libraryViewMode: Writable<ViewMode> = createViewModeStore('library');
export const musicViewMode: Writable<ViewMode> = createViewModeStore('music');
export const playlistsViewMode: Writable<ViewMode> = createViewModeStore('playlists');
export const recentViewMode: Writable<ViewMode> = createViewModeStore('recent');
export const networkViewMode: Writable<ViewMode> = createViewModeStore('network');

/** Per-scope public stores for hydration. */
const viewModeStores: Record<ViewModeScope, Writable<ViewMode>> = {
  library: libraryViewMode,
  music: musicViewMode,
  playlists: playlistsViewMode,
  recent: recentViewMode,
  network: networkViewMode,
};

// Desktop hydration: apply the persisted snapshot scope by scope. The mirror
// is updated before each set so the stores' subscribers see an unchanged
// mirror and do not write the snapshot straight back.
void (async () => {
  const raw = await loadPersistedRaw(VIEW_MODES_STORAGE_KEY);
  if (raw === null) return;
  try {
    const next = sanitizeModes(JSON.parse(raw) as unknown);
    for (const scope of VIEW_MODE_SCOPES) {
      modes[scope] = next[scope];
      viewModeStores[scope].set(next[scope]);
    }
  } catch {
    // Malformed legacy blob: defaults stand.
  }
})();
