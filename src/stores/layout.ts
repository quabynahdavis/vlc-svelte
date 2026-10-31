import { writable } from 'svelte/store';
import { NAV_ITEMS, type NavId } from '../lib/constants';
import type { DockMode } from './ui';

/**
 * User-customisable shell layout.
 *
 * The store only covers the surfaces that are safe to reorder today: the
 * primary rail, the right-dock tab strip and the visibility of the transport's
 * secondary controls. The player's previous/play/next cluster and the seek bar
 * stay fixed because they are the primary transport.
 */
export type PlayerControlId =
  | 'volume'
  | 'audio'
  | 'subtitles'
  | 'settings'
  | 'fullscreen'
  | 'queue';

export interface LayoutState {
  railOrder: NavId[];
  dockTabOrder: DockMode[];
  playerControls: Record<PlayerControlId, boolean>;
}

export const PLAYER_CONTROL_LABELS: Record<PlayerControlId, string> = {
  volume: 'Volume control',
  audio: 'Audio dock button',
  subtitles: 'Subtitles dock button',
  settings: 'Settings button',
  fullscreen: 'Fullscreen button',
  queue: 'Queue button',
};

export const PLAYER_CONTROL_IDS: PlayerControlId[] = [
  'volume',
  'audio',
  'subtitles',
  'settings',
  'fullscreen',
  'queue',
];

const STORAGE_KEY = 'vlc.layout.v1';

const DEFAULT_RAIL_ORDER: NavId[] = NAV_ITEMS.map((item) => item.id as NavId);
const DEFAULT_DOCK_ORDER: DockMode[] = [
  'playback',
  'video',
  'audio',
  'visualizer',
  'subtitles',
  'bookmarks',
];

const DEFAULT_PLAYER_CONTROLS: Record<PlayerControlId, boolean> = {
  volume: true,
  audio: true,
  subtitles: true,
  settings: true,
  fullscreen: true,
  queue: true,
};

function defaults(): LayoutState {
  return {
    railOrder: [...DEFAULT_RAIL_ORDER],
    dockTabOrder: [...DEFAULT_DOCK_ORDER],
    playerControls: { ...DEFAULT_PLAYER_CONTROLS },
  };
}

function isDockMode(value: unknown): value is DockMode {
  return (
    value === 'closed' ||
    value === 'playback' ||
    value === 'audio' ||
    value === 'subtitles' ||
    value === 'video' ||
    value === 'visualizer' ||
    value === 'queue' ||
    value === 'bookmarks'
  );
}

function isNavId(value: unknown): value is NavId {
  return (
    value === 'home' ||
    value === 'videos' ||
    value === 'music' ||
    value === 'network' ||
    value === 'playlists' ||
    value === 'recent'
  );
}

/** Keep known values, remove duplicates, then append anything new. */
function normalizeOrder<T extends string>(value: unknown, allowed: readonly T[], fallback: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      if (!allowed.includes(entry as T)) continue;
      if (seen.has(entry as T)) continue;
      seen.add(entry as T);
      result.push(entry as T);
    }
  }

  for (const entry of fallback) {
    if (!seen.has(entry)) result.push(entry);
  }

  return result;
}

function normalizePlayerControls(value: unknown): Record<PlayerControlId, boolean> {
  const result = { ...DEFAULT_PLAYER_CONTROLS };

  if (!value || typeof value !== 'object') return result;

  for (const id of PLAYER_CONTROL_IDS) {
    const entry = (value as Record<string, unknown>)[id];
    if (typeof entry === 'boolean') result[id] = entry;
  }

  return result;
}

function loadLayout(): LayoutState {
  if (typeof localStorage === 'undefined') return defaults();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();

    const parsed = JSON.parse(raw) as Partial<LayoutState> | null;
    if (!parsed || typeof parsed !== 'object') return defaults();

    return {
      railOrder: normalizeOrder(parsed.railOrder, DEFAULT_RAIL_ORDER, DEFAULT_RAIL_ORDER),
      dockTabOrder: normalizeOrder(
        parsed.dockTabOrder,
        DEFAULT_DOCK_ORDER.filter(isDockMode),
        DEFAULT_DOCK_ORDER,
      ),
      playerControls: normalizePlayerControls(parsed.playerControls),
    };
  } catch {
    return defaults();
  }
}

export const layout = writable<LayoutState>(loadLayout());

function persist(state: LayoutState): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a blocked storage quota: keep the in-memory layout.
  }
}

if (typeof window !== 'undefined') {
  layout.subscribe(persist);
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;

  const next = [...items];
  const [removed] = next.splice(from, 1);
  if (removed === undefined) return items;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, removed);
  return next;
}

export function moveRailItem(from: number, to: number): void {
  layout.update((state) => ({
    ...state,
    railOrder: move(state.railOrder, from, to),
  }));
}

export function moveDockTab(from: number, to: number): void {
  layout.update((state) => ({
    ...state,
    dockTabOrder: move(state.dockTabOrder, from, to),
  }));
}

export function setPlayerControl(id: PlayerControlId, visible: boolean): void {
  layout.update((state) => ({
    ...state,
    playerControls: { ...state.playerControls, [id]: visible },
  }));
}

export function resetLayout(): void {
  layout.set(defaults());
}

export { DEFAULT_DOCK_ORDER, DEFAULT_PLAYER_CONTROLS, DEFAULT_RAIL_ORDER, isDockMode, isNavId };
