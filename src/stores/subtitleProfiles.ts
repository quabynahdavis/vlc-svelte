/**
 * Subtitle formatting profiles, saved presets and per-show defaults.
 *
 * Everything lives in one versioned JSON document under
 * `vlc.subtitles.v1`. Persisted data is untrusted: every field is validated
 * and falls back to a sensible default, while blocked/quota-exceeded storage
 * silently degrades to in-memory state.
 *
 * Important: this store only records preferences. The current app has no
 * subtitle cue parser or renderer, so none of these values are painted on the
 * video surface yet.
 */
import { get, writable } from 'svelte/store';

export type SubtitleSizeMode = 'relative' | 'exact';
export type SubtitleVerticalPosition = 'bottom' | 'lower-middle' | 'middle' | 'top';

export interface SubtitleFormatting {
  /** Font family name. Kept to the fonts offered by the panel. */
  font: string;
  /** `#RRGGBB`, upper-cased by the sanitiser. */
  textColor: string;
  /** `#RRGGBB`, upper-cased by the sanitiser. */
  outlineColor: string;
  sizeMode: SubtitleSizeMode;
  /** Percent for `relative`, pixels for `exact`. */
  size: number;
  /** Outline/stroke width in pixels (0–4). */
  outlineWidth: number;
  /** Background box opacity in percent (0–100). */
  backgroundOpacity: number;
  verticalPosition: SubtitleVerticalPosition;
}

export interface SubtitleProfileSnapshot {
  formatting: SubtitleFormatting;
  /** Subtitle delay in seconds (-10 to +10, 0.05 s steps). */
  delay: number;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  builtin: boolean;
  profile: SubtitleProfileSnapshot;
}

export interface ShowSubtitleDefaults {
  showKey: string;
  track: string;
  language: string;
  profile: SubtitleProfileSnapshot;
  updatedAt: number;
}

export interface SubtitleProfilesState {
  formatting: SubtitleFormatting;
  customPresets: SubtitlePreset[];
  shows: Record<string, ShowSubtitleDefaults>;
}

/** Bump the version suffix when the persisted shape changes. */
export const SUBTITLE_PROFILES_STORAGE_KEY = 'vlc.subtitles.v1';

export const SUBTITLE_FONTS = ['Inter', 'Roboto', 'Noto Sans', 'DejaVu Sans'] as const;

export const SUBTITLE_SIZE_MODES: readonly SubtitleSizeMode[] = ['relative', 'exact'];

export const SUBTITLE_VERTICAL_POSITION_OPTIONS: ReadonlyArray<{
  value: SubtitleVerticalPosition;
  label: string;
}> = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'lower-middle', label: 'Lower middle' },
  { value: 'middle', label: 'Middle' },
  { value: 'top', label: 'Top' },
];

export const DEFAULT_SUBTITLE_FORMATTING: Readonly<SubtitleFormatting> = {
  font: 'Inter',
  textColor: '#B8B8B8',
  outlineColor: '#0E0E0E',
  sizeMode: 'relative',
  size: 100,
  outlineWidth: 1.5,
  backgroundOpacity: 25,
  verticalPosition: 'bottom',
};

export const DEFAULT_SUBTITLE_PROFILE: Readonly<SubtitleProfileSnapshot> = {
  formatting: DEFAULT_SUBTITLE_FORMATTING,
  delay: 0,
};

const DEFAULT_RELATIVE_SIZE = 100;
const DEFAULT_EXACT_SIZE = 24;
const RELATIVE_MIN = 50;
const RELATIVE_MAX = 200;
const EXACT_MIN = 12;
const EXACT_MAX = 72;
const MAX_OUTLINE_WIDTH = 4;
const MAX_PRESET_NAME_LENGTH = 40;
const MAX_CUSTOM_PRESETS = 40;
const MAX_SHOWS = 100;
const MAX_SHOW_KEY_LENGTH = 120;
const MAX_TRACK_LENGTH = 120;
const MAX_LANGUAGE_LENGTH = 40;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const BUILTIN_PRESET_IDS = new Set(['builtin:default', 'builtin:large', 'builtin:cinema']);

function defaultFormatting(): SubtitleFormatting {
  return { ...DEFAULT_SUBTITLE_FORMATTING };
}

function defaultProfile(): SubtitleProfileSnapshot {
  return { formatting: defaultFormatting(), delay: 0 };
}

/**
 * Built-in presets are code constants: they can be applied but never deleted.
 * `Default` intentionally restores the stock look and a zero offset.
 */
export const BUILTIN_SUBTITLE_PRESETS: readonly SubtitlePreset[] = [
  {
    id: 'builtin:default',
    name: 'Default',
    builtin: true,
    profile: defaultProfile(),
  },
  {
    id: 'builtin:large',
    name: 'Large',
    builtin: true,
    profile: {
      formatting: {
        ...DEFAULT_SUBTITLE_FORMATTING,
        size: 150,
        outlineWidth: 2.5,
        backgroundOpacity: 50,
      },
      delay: 0,
    },
  },
  {
    id: 'builtin:cinema',
    name: 'Cinema',
    builtin: true,
    profile: {
      formatting: {
        ...DEFAULT_SUBTITLE_FORMATTING,
        font: 'Noto Sans',
        textColor: '#F2E9D8',
        size: 120,
        outlineWidth: 2,
        backgroundOpacity: 10,
        verticalPosition: 'lower-middle',
      },
      delay: 0,
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isSizeMode(value: unknown): value is SubtitleSizeMode {
  return typeof value === 'string' && (SUBTITLE_SIZE_MODES as readonly string[]).includes(value);
}

function isVerticalPosition(value: unknown): value is SubtitleVerticalPosition {
  return (
    typeof value === 'string' &&
    SUBTITLE_VERTICAL_POSITION_OPTIONS.some((option) => option.value === value)
  );
}

function isSubtitleFont(value: unknown): value is (typeof SUBTITLE_FONTS)[number] {
  return typeof value === 'string' && (SUBTITLE_FONTS as readonly string[]).includes(value);
}

function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')
      .toUpperCase()}`;
  }
  return fallback;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function defaultSizeForMode(mode: SubtitleSizeMode): number {
  return mode === 'relative' ? DEFAULT_RELATIVE_SIZE : DEFAULT_EXACT_SIZE;
}

function sanitizeSize(mode: SubtitleSizeMode, value: unknown): number {
  const fallback = defaultSizeForMode(mode);
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const min = mode === 'relative' ? RELATIVE_MIN : EXACT_MIN;
  const max = mode === 'relative' ? RELATIVE_MAX : EXACT_MAX;
  return Math.round(clamp(numeric, min, max));
}

function sanitizeOutlineWidth(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : DEFAULT_SUBTITLE_FORMATTING.outlineWidth;
  return Math.round(clamp(numeric, 0, MAX_OUTLINE_WIDTH) * 10) / 10;
}

function sanitizeBackgroundOpacity(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : DEFAULT_SUBTITLE_FORMATTING.backgroundOpacity;
  return Math.round(clamp(numeric, 0, 100));
}

/** Clamp to the supported delay range and snap to the 0.05 s drag step. */
export function snapSubtitleDelay(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.round(clamp(value, -10, 10) / 0.05) * 0.05;
  return Number(clamp(snapped, -10, 10).toFixed(3));
}

function sanitizeDelay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return snapSubtitleDelay(value);
}

export function sanitizeSubtitleFormatting(
  value: unknown,
  fallback: SubtitleFormatting = DEFAULT_SUBTITLE_FORMATTING,
): SubtitleFormatting {
  const base = { ...fallback };
  if (!isRecord(value)) return base;

  const sizeMode = isSizeMode(value.sizeMode) ? value.sizeMode : base.sizeMode;

  return {
    font: isSubtitleFont(value.font) ? value.font : base.font,
    textColor: sanitizeColor(value.textColor, base.textColor),
    outlineColor: sanitizeColor(value.outlineColor, base.outlineColor),
    sizeMode,
    size: sanitizeSize(sizeMode, numberOr(value.size, base.size)),
    outlineWidth: sanitizeOutlineWidth(numberOr(value.outlineWidth, base.outlineWidth)),
    backgroundOpacity: sanitizeBackgroundOpacity(
      numberOr(value.backgroundOpacity, base.backgroundOpacity),
    ),
    verticalPosition: isVerticalPosition(value.verticalPosition)
      ? value.verticalPosition
      : base.verticalPosition,
  };
}

export function sanitizeSubtitleProfile(
  value: unknown,
  fallback: SubtitleProfileSnapshot = DEFAULT_SUBTITLE_PROFILE,
): SubtitleProfileSnapshot {
  if (!isRecord(value)) {
    return { formatting: { ...fallback.formatting }, delay: fallback.delay };
  }

  return {
    formatting: sanitizeSubtitleFormatting(value.formatting, fallback.formatting),
    delay: sanitizeDelay(numberOr(value.delay, fallback.delay)),
  };
}

/** Normalise a show key; rejects empty and prototype-polluting names. */
export function sanitizeShowKey(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, MAX_SHOW_KEY_LENGTH).trim();
  if (!normalized || UNSAFE_OBJECT_KEYS.has(normalized.toLocaleLowerCase())) return '';
  return normalized;
}

const MEDIA_EXTENSION =
  /\.(?:mp4|mkv|avi|mov|wmv|flv|webm|ts|m2ts|mpg|mpeg|m4v|ogv|mp3|flac|ogg|wav|aac|m4a|wma|opus|srt|vtt|ass|ssa|sub)$/i;

/**
 * Matches a trailing episode marker such as `S01E02`, `E02`, `EP02` or
 * `Episode 2`, optionally separated by space, dot, underscore or dash.
 */
const EPISODE_SUFFIX =
  /[\s._-]+(?:S\d{1,2}[\s._-]*E\d{1,3}|E(?:P(?:ISODE)?)?[\s._-]*\d{1,3})$/i;

/**
 * Derive a per-show key from a media title.
 *
 * The media extension and a trailing episode marker are stripped, so
 * `The_Wand_S01E05.mp4` becomes `The_Wand`. Titles that contain nothing else
 * fall back to the original title, and missing/blank titles become
 * `Unknown show`.
 */
export function showKeyFromTitle(title: string | null | undefined): string {
  const fallback = 'Unknown show';
  if (typeof title !== 'string') return fallback;

  const trimmed = title.trim();
  if (!trimmed) return fallback;

  const withoutExtension = trimmed.replace(MEDIA_EXTENSION, '').trim();
  const stripped = withoutExtension
    .replace(EPISODE_SUFFIX, '')
    .replace(/[\s._-]+$/g, '')
    .trim();

  const candidate = (stripped || withoutExtension || trimmed).replace(/\s+/g, ' ').trim();
  return sanitizeShowKey(candidate) || fallback;
}

function makePresetId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `custom:${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the timestamp/random id.
  }

  return `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeCustomPresets(value: unknown): SubtitlePreset[] {
  if (!Array.isArray(value)) return [];

  const presets: SubtitlePreset[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const candidate of value) {
    if (!isRecord(candidate) || candidate.builtin === true) continue;

    const name = sanitizeText(candidate.name, MAX_PRESET_NAME_LENGTH);
    if (!name) continue;

    const nameKey = name.toLocaleLowerCase();
    if (names.has(nameKey)) continue;

    let id = sanitizeText(candidate.id, 120);
    if (!id || ids.has(id) || BUILTIN_PRESET_IDS.has(id)) id = makePresetId();
    while (ids.has(id)) id = makePresetId();

    ids.add(id);
    names.add(nameKey);
    presets.push({
      id,
      name,
      builtin: false,
      profile: sanitizeSubtitleProfile(candidate.profile),
    });

    if (presets.length >= MAX_CUSTOM_PRESETS) break;
  }

  return presets;
}

function sanitizeShows(value: unknown): Record<string, ShowSubtitleDefaults> {
  const shows: Record<string, ShowSubtitleDefaults> = {};
  if (!isRecord(value)) return shows;

  let count = 0;

  for (const [rawKey, candidate] of Object.entries(value)) {
    const key = sanitizeShowKey(rawKey);
    if (!key || !isRecord(candidate)) continue;
    if (Object.prototype.hasOwnProperty.call(shows, key)) continue;

    const storedKey =
      sanitizeShowKey(typeof candidate.showKey === 'string' ? candidate.showKey : key) || key;

    shows[key] = {
      showKey: storedKey,
      track: sanitizeText(candidate.track, MAX_TRACK_LENGTH),
      language: sanitizeText(candidate.language, MAX_LANGUAGE_LENGTH),
      profile: sanitizeSubtitleProfile(candidate.profile),
      updatedAt:
        typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : 0,
    };

    count += 1;
    if (count >= MAX_SHOWS) break;
  }

  return shows;
}

function createDefaultState(): SubtitleProfilesState {
  return {
    formatting: defaultFormatting(),
    customPresets: [],
    shows: {},
  };
}

function sanitizeState(value: unknown): SubtitleProfilesState {
  const state = createDefaultState();
  if (!isRecord(value)) return state;

  state.formatting = sanitizeSubtitleFormatting(value.formatting);

  const presetSource = Array.isArray(value.presets)
    ? value.presets
    : Array.isArray(value.customPresets)
      ? value.customPresets
      : [];
  state.customPresets = sanitizeCustomPresets(presetSource);
  state.shows = sanitizeShows(value.shows);

  return state;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True when a formatting object was present in storage at module load. */
let formattingLoadedFromStorage = false;

function loadState(): SubtitleProfilesState {
  const storage = getStorage();
  if (!storage) return createDefaultState();

  try {
    const raw = storage.getItem(SUBTITLE_PROFILES_STORAGE_KEY);
    if (raw === null) return createDefaultState();

    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed) && isRecord(parsed.formatting)) {
      formattingLoadedFromStorage = true;
    }

    return sanitizeState(parsed);
  } catch {
    // Malformed JSON or blocked storage: start from defaults.
    return createDefaultState();
  }
}

function persistState(state: SubtitleProfilesState): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(
      SUBTITLE_PROFILES_STORAGE_KEY,
      JSON.stringify({
        formatting: state.formatting,
        presets: state.customPresets,
        shows: state.shows,
      }),
    );
  } catch {
    // Quota exceeded, private mode, or blocked storage: keep in-memory only.
  }
}

export const subtitleProfiles = writable<SubtitleProfilesState>(loadState());

function commit(next: SubtitleProfilesState): SubtitleProfilesState {
  const sanitized = sanitizeState(next);
  subtitleProfiles.set(sanitized);
  persistState(sanitized);
  return sanitized;
}

/**
 * Whether formatting came from storage. The dock uses this once to migrate the
 * older settings-based font/colours into the profile store on first run.
 */
export function hasPersistedSubtitleFormatting(): boolean {
  return formattingLoadedFromStorage;
}

/** Merge a partial formatting patch, sanitise it and persist the result. */
export function updateFormatting(patch: Partial<SubtitleFormatting>): SubtitleFormatting {
  const current = get(subtitleProfiles);
  const formatting = sanitizeSubtitleFormatting(
    { ...current.formatting, ...patch },
    current.formatting,
  );

  commit({ ...current, formatting });
  return formatting;
}

/**
 * Save (or replace, by case-insensitive name) a custom preset.
 * Returns the stored preset, or `null` for an empty/invalid name.
 */
export function saveCustomPreset(
  name: string,
  profile: SubtitleProfileSnapshot,
): SubtitlePreset | null {
  const trimmed = name.trim().slice(0, MAX_PRESET_NAME_LENGTH).trim();
  if (!trimmed) return null;

  const current = get(subtitleProfiles);
  const nameKey = trimmed.toLocaleLowerCase();
  const existingIndex = current.customPresets.findIndex(
    (preset) => preset.name.toLocaleLowerCase() === nameKey,
  );

  let saved: SubtitlePreset;
  let customPresets: SubtitlePreset[];

  if (existingIndex >= 0) {
    saved = {
      ...current.customPresets[existingIndex],
      name: trimmed,
      builtin: false,
      profile: sanitizeSubtitleProfile(profile),
    };
    customPresets = current.customPresets.map((preset, index) =>
      index === existingIndex ? saved : preset,
    );
  } else {
    saved = {
      id: makePresetId(),
      name: trimmed,
      builtin: false,
      profile: sanitizeSubtitleProfile(profile),
    };
    customPresets = [...current.customPresets, saved].slice(-MAX_CUSTOM_PRESETS);
  }

  commit({ ...current, customPresets });
  return saved;
}

/** Delete a custom preset. Built-in presets are never in this list. */
export function deleteCustomPreset(id: string): boolean {
  const current = get(subtitleProfiles);
  const customPresets = current.customPresets.filter((preset) => preset.id !== id);
  if (customPresets.length === current.customPresets.length) return false;

  commit({ ...current, customPresets });
  return true;
}

/** Look up saved defaults by show key, falling back to a case-insensitive match. */
export function findShowDefaults(
  state: SubtitleProfilesState,
  showKey: string,
): ShowSubtitleDefaults | null {
  const key = sanitizeShowKey(showKey);
  if (!key) return null;

  if (Object.prototype.hasOwnProperty.call(state.shows, key)) {
    return state.shows[key] ?? null;
  }

  const lowerKey = key.toLocaleLowerCase();
  for (const [storedKey, defaults] of Object.entries(state.shows)) {
    if (storedKey.toLocaleLowerCase() === lowerKey) return defaults;
  }

  return null;
}

export interface RememberShowInput {
  track: string;
  language: string;
  profile: SubtitleProfileSnapshot;
}

/** Save the current track/language/style/delay under a show key. */
export function rememberShowDefaults(
  showKey: string,
  input: RememberShowInput,
): ShowSubtitleDefaults | null {
  const key = sanitizeShowKey(showKey);
  if (!key) return null;

  const current = get(subtitleProfiles);
  const saved: ShowSubtitleDefaults = {
    showKey: key,
    track: sanitizeText(input.track, MAX_TRACK_LENGTH),
    language: sanitizeText(input.language, MAX_LANGUAGE_LENGTH),
    profile: sanitizeSubtitleProfile(input.profile),
    updatedAt: Date.now(),
  };

  const shows = { ...current.shows, [key]: saved };

  // Keep storage bounded by dropping the least recently updated shows.
  const entries = Object.entries(shows);
  if (entries.length > MAX_SHOWS) {
    entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (const [oldKey] of entries.slice(0, entries.length - MAX_SHOWS)) {
      delete shows[oldKey];
    }
  }

  commit({ ...current, shows });
  return saved;
}

/** Remove a show's saved defaults. */
export function forgetShowDefaults(showKey: string): boolean {
  const key = sanitizeShowKey(showKey);
  if (!key) return false;

  const current = get(subtitleProfiles);
  if (!Object.prototype.hasOwnProperty.call(current.shows, key)) return false;

  const shows = { ...current.shows };
  delete shows[key];
  commit({ ...current, shows });
  return true;
}
