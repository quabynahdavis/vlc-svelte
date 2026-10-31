import { get, writable } from 'svelte/store';
import { validateSettings } from '../lib/settingsPersistence';
import {
  DEFAULT_SETTINGS,
  createDefaultSettings,
  resetSettings,
  settings,
  type SettingsState,
} from './settings';

/**
 * Settings profiles: named snapshots of the whole settings tree that the user
 * can re-apply later. Stored separately from the live settings so switching
 * profiles never rewrites the saved profile list.
 */
export const PROFILES_STORAGE_KEY = 'vlc.settings.profiles.v1';
export const MAX_PROFILES = 30;
export const MAX_PROFILE_NAME_LENGTH = 60;
export const DEFAULT_PROFILE_ID = 'builtin-default';

export interface SettingsProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: SettingsState;
}

export type ProfileResult =
  | { ok: true; profile: SettingsProfile }
  | { ok: false; error: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Built-in profile shown first in the list; never persisted or editable. */
export const DEFAULT_PROFILE: SettingsProfile = {
  id: DEFAULT_PROFILE_ID,
  name: 'Default',
  createdAt: 0,
  updatedAt: 0,
  settings: clone(DEFAULT_SETTINGS),
};

export function isBuiltInProfile(profile: SettingsProfile): boolean {
  return profile.id === DEFAULT_PROFILE_ID;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_PROFILE_NAME_LENGTH) return null;
  // Control characters would make the stored name unreadable.
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function sanitizeTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeProfile(
  value: unknown,
  seenIds: Set<string>,
  seenNames: Set<string>,
): SettingsProfile | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id || id.length > 120 || id === DEFAULT_PROFILE_ID || seenIds.has(id)) return null;

  const name = sanitizeName(value.name);
  if (!name || seenNames.has(name.toLowerCase())) return null;

  const createdAt = sanitizeTimestamp(value.createdAt);
  const updatedAt = sanitizeTimestamp(value.updatedAt);
  if (createdAt === null || updatedAt === null) return null;

  // A profile without a settings object is malformed; do not silently replace
  // it with defaults, because that would look like a valid profile.
  if (!isRecord(value.settings)) return null;

  const clean: SettingsProfile = {
    id,
    name,
    createdAt,
    updatedAt,
    settings: validateSettings(value.settings, DEFAULT_SETTINGS),
  };

  seenIds.add(id);
  seenNames.add(name.toLowerCase());
  return clean;
}

/** Load and validate persisted profiles; malformed entries are dropped. */
export function loadProfiles(): SettingsProfile[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const result: SettingsProfile[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>([DEFAULT_PROFILE.name.toLowerCase()]);

    for (const entry of parsed) {
      if (result.length >= MAX_PROFILES) break;
      const profile = sanitizeProfile(entry, seenIds, seenNames);
      if (profile) result.push(profile);
    }

    return result;
  } catch {
    // Corrupt JSON, blocked storage: start with no user profiles.
    return [];
  }
}

function persist(state: SettingsProfile[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage blocked: profiles stay in memory only.
  }
}

export const profiles = writable<SettingsProfile[]>(loadProfiles());

let isFirstEmission = true;
profiles.subscribe((state) => {
  if (isFirstEmission) {
    isFirstEmission = false;
    return;
  }
  persist(state);
});

function nameTaken(name: string, excludeId?: string): boolean {
  const lower = name.toLowerCase();
  if (DEFAULT_PROFILE.name.toLowerCase() === lower) return true;
  return get(profiles).some(
    (profile) => profile.id !== excludeId && profile.name.toLowerCase() === lower,
  );
}

function createId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Older WebViews may not expose randomUUID.
  }
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Snapshot the current settings under a new name. */
export function saveCurrentAsProfile(rawName: string): ProfileResult {
  const name = sanitizeName(rawName);
  if (!name) {
    return {
      ok: false,
      error:
        rawName.trim().length === 0
          ? 'Enter a profile name.'
          : `Profile names must be 1–${MAX_PROFILE_NAME_LENGTH} characters.`,
    };
  }

  if (nameTaken(name)) {
    return { ok: false, error: 'A profile with this name already exists.' };
  }

  const list = get(profiles);
  if (list.length >= MAX_PROFILES) {
    return { ok: false, error: `You can keep up to ${MAX_PROFILES} profiles.` };
  }

  const now = Date.now();
  const profile: SettingsProfile = {
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: clone(get(settings)),
  };

  profiles.set([...list, profile]);
  return { ok: true, profile };
}

/** Apply a profile to the live settings store. */
export function applyProfile(id: string): boolean {
  if (id === DEFAULT_PROFILE_ID) {
    resetSettings();
    return true;
  }

  const profile = get(profiles).find((entry) => entry.id === id);
  if (!profile) return false;

  settings.set(clone(profile.settings));
  return true;
}

export function renameProfile(id: string, rawName: string): { ok: true } | { ok: false; error: string } {
  if (id === DEFAULT_PROFILE_ID) {
    return { ok: false, error: 'The default profile cannot be renamed.' };
  }

  const name = sanitizeName(rawName);
  if (!name) {
    return { ok: false, error: `Profile names must be 1–${MAX_PROFILE_NAME_LENGTH} characters.` };
  }

  const list = get(profiles);
  if (!list.some((profile) => profile.id === id)) {
    return { ok: false, error: 'This profile no longer exists.' };
  }

  if (nameTaken(name, id)) {
    return { ok: false, error: 'A profile with this name already exists.' };
  }

  profiles.set(
    list.map((profile) =>
      profile.id === id ? { ...profile, name, updatedAt: Date.now() } : profile,
    ),
  );
  return { ok: true };
}

export function deleteProfile(id: string): boolean {
  if (id === DEFAULT_PROFILE_ID) return false;

  const list = get(profiles);
  const next = list.filter((profile) => profile.id !== id);
  if (next.length === list.length) return false;

  profiles.set(next);
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (typeof a === 'object') {
    const aKeys = Object.keys(a as UnknownRecord);
    const bKeys = Object.keys(b as UnknownRecord);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual((a as UnknownRecord)[key], (b as UnknownRecord)[key]),
    );
  }

  return false;
}

export function settingsEqual(a: SettingsState, b: SettingsState): boolean {
  return deepEqual(a, b);
}

/** True when the live settings already match the profile exactly. */
export function profileMatchesCurrentSettings(profile: SettingsProfile): boolean {
  return deepEqual(get(settings), profile.settings);
}

/** Deep clone of the defaults for callers that need a mutable snapshot. */
export function defaultProfileSettings(): SettingsState {
  return createDefaultSettings();
}
