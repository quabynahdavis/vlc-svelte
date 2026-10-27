/**
 * Durable settings storage.
 *
 * Persisted JSON is never trusted: it is merged over `defaultSettings` and
 * validated field by field, so unknown keys are dropped and malformed values
 * fall back to their defaults. The module is DOM-aware but tolerant of
 * missing/blocked localStorage (private mode, storage disabled, SSR).
 */
import type { SettingsState } from '../stores/settings';
import { isHexColor } from './theme';

/** Bump the suffix when the persisted shape changes incompatibly. */
export const SETTINGS_STORAGE_KEY = 'vlc.settings.v1';

const SAVE_DEBOUNCE_MS = 250;
const MAX_STRING_LENGTH = 4096;
const MAX_LIST_ITEMS = 500;
const THEMES = new Set(['dark', 'light', 'system']);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeString(key: string, fallback: string, value: unknown): string {
  if (key === 'accentColor') return isHexColor(value) ? value.toUpperCase() : fallback;
  if (key === 'theme') {
    return typeof value === 'string' && THEMES.has(value) ? value : fallback;
  }
  if (typeof value !== 'string') return fallback;
  if (value.length > MAX_STRING_LENGTH) return fallback;
  if (key === 'interfaceLanguage' && value.trim().length === 0) return fallback;
  return value;
}

function sanitizeObjectArray(fallback: unknown[], value: unknown[]): unknown[] {
  const sample = fallback[0];
  if (!isRecord(sample)) return clone(fallback);

  const shape = Object.keys(sample);
  const sanitized: UnknownRecord[] = [];

  for (const item of value) {
    if (!isRecord(item)) return clone(fallback);
    const clean: UnknownRecord = {};
    for (const property of shape) {
      if (typeof item[property] !== typeof sample[property]) return clone(fallback);
      clean[property] = item[property];
    }
    sanitized.push(clean);
  }

  return sanitized;
}

function sanitizeArray(key: string, fallback: unknown[], value: unknown): unknown[] {
  if (!Array.isArray(value)) return clone(fallback);

  if (key === 'eqGains') {
    if (value.length !== fallback.length) return clone(fallback);
    if (!value.every((gain) => typeof gain === 'number' && Number.isFinite(gain))) {
      return clone(fallback);
    }
    return value.map((gain) => Math.max(-20, Math.min(20, gain as number)));
  }

  if (key === 'libraryFolders') {
    const folders = value
      .filter((folder): folder is string => typeof folder === 'string')
      .map((folder) => folder.trim())
      .filter((folder) => folder.length > 0 && folder.length <= MAX_STRING_LENGTH);
    return Array.from(new Set(folders)).slice(0, MAX_LIST_ITEMS);
  }

  return sanitizeObjectArray(fallback, value);
}

function sanitizeRecord(fallback: UnknownRecord, value: unknown): UnknownRecord {
  if (!isRecord(value)) return clone(fallback);

  const result: UnknownRecord = {};
  for (const [key, fallbackValue] of Object.entries(fallback)) {
    result[key] = sanitizeValue(key, fallbackValue, value[key]);
  }
  return result;
}

function sanitizeValue(key: string, fallback: unknown, value: unknown): unknown {
  if (typeof fallback === 'string') return sanitizeString(key, fallback, value);
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (typeof fallback === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }
  if (Array.isArray(fallback)) return sanitizeArray(key, fallback, value);
  if (isRecord(fallback)) return sanitizeRecord(fallback, value);
  return clone(fallback);
}

/**
 * Validate an arbitrary value against the defaults and return a complete,
 * fresh `SettingsState`. Missing fields keep their defaults; unknown keys are
 * ignored.
 */
export function validateSettings(input: unknown, defaults: SettingsState): SettingsState {
  const base = clone(defaults);
  if (!isRecord(input)) return base;

  const baseRecord = base as unknown as UnknownRecord;
  const result: UnknownRecord = {};

  for (const key of Object.keys(baseRecord)) {
    result[key] = sanitizeValue(key, baseRecord[key], input[key]);
  }

  return result as unknown as SettingsState;
}

/** Parse exported/imported JSON and merge it over the defaults. */
export function parseSettingsJson(json: string, defaults: SettingsState): SettingsState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Settings must be a JSON object.');
  }

  return validateSettings(parsed, defaults);
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Load persisted settings, falling back to a deep clone of the defaults. */
export function loadSettings(defaults: SettingsState): SettingsState {
  const storage = getStorage();
  if (!storage) return clone(defaults);

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return clone(defaults);
    return validateSettings(JSON.parse(raw) as unknown, defaults);
  } catch {
    return clone(defaults);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: SettingsState | null = null;

/** Flush any pending write immediately (used on pagehide). */
export function flushSettingsSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const state = pendingState;
  pendingState = null;
  if (!state) return;

  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage blocked: settings stay in memory only.
  }
}

/** Debounced save; safe to call on every store emission. */
export function scheduleSettingsSave(state: SettingsState): void {
  pendingState = state;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSettingsSave();
  }, SAVE_DEBOUNCE_MS);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushSettingsSave);
}
