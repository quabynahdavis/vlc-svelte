import { get, writable } from 'svelte/store';
import {
  EQ_LAYOUT_ID,
  loadSettings,
  parseSettingsJson,
  scheduleSettingsSave,
  hydrateSettings,
} from '../lib/settingsPersistence';
import { hasTauri, syncLibraryAssetScope } from '../lib/tauriFs';

/**
 * A single typed settings store keeps the panel bindings simple:
 * `bind:value={$settings.someField}` works for every control.
 */

export interface EqualizerBand {
  id: string;
  label: string;
  min: number;
  max: number;
}

export interface HotkeyAction {
  action: string;
  shortcut: string;
}

export interface ExtensionItem {
  name: string;
  version: string;
  author: string;
  enabled: boolean;
}

export interface FileTypeCategory {
  video: string[];
  audio: string[];
  playlist: string[];
  subtitle: string[];
}

export interface VideoFilterItem {
  name: string;
  enabled: boolean;
  // Each filter could have its own settings, kept simple for now
}

export interface SettingsState {
  // Appearance
  interfaceLanguage: string;
  theme: string;
  accentColor: string;

  // Startup
  confirmationDialogs: boolean;
  automaticUpdates: boolean;

  // Diagnostics
  developerMode: boolean;
  saveLog: boolean;
  logFile: string;
  logDetails: string;

  // Audio
  equalizer: boolean;
  equalizerPreset: string;
  equalizerOpen: boolean;
  /**
   * `libvlc-iso-10` once gains are for the libvlc ISO bands below.
   * Older saves used 60/170/310/600/1k/3k/6k/12k/14k/16k and are reset.
   */
  eqLayout: string;
  eqGains: number[];
  twoPass: boolean;
  spatialAudio: boolean;
  spatialAudioMode: string;
  stereoWidening: boolean;

  // Subtitles
  subtitleTrack: string;
  subtitleLanguage: string;
  subtitleDelay: string;
  subtitleSpeed: string;
  subtitleDurationFactor: string;
  embeddedSubFormat: boolean;
  subtitleFont: string;
  subtitleTextColor: string;
  subtitleOutlineColor: string;
  subtitlePresetOpen: boolean;

  // Subtitle matching
  matchSubtitlesByFilename: boolean;
  preferForcedSubtitles: boolean;
  autoLoadSubtitlesFromFolder: boolean;
  subtitleLanguagePriority: string;

  // Interface
  minimizeToTray: boolean;
  showSystrayIcon: boolean;
  singleInstance: boolean;
  showRemainingTime: boolean;
  fileCachingMs: string;

  // Window chrome
  /** `true` = native OS title bar/decorations, `false` = in-app custom title bar. */
  useSystemTitleBar: boolean;

  // Privacy
  allowNetworkAccess: boolean;
  sendUsageStats: boolean;
  checkUpdatesAutomatically: boolean;

  // Controls
  hotkeys: HotkeyAction[];

  // Playback
  skipFrames: boolean;
  dropLateFrames: boolean;
  hardwareDecoding: string;
  hardwareDecodingEnabled: boolean;
  allowSpeedPlayback: boolean;
  defaultPlaybackSpeed: string;
  loopMode: string;
  resumePlayback: boolean;
  /** Opt-in: route local audio tracks through the libvlc backend when the desktop shell ships it. */
  nativePlayback: boolean;

  // Video
  outputModule: string;
  deinterlaceMode: string;
  deinterlace: boolean;
  postProcessingLevel: number;
  snapshotDirectory: string;
  snapshotFormat: string;
  snapshotSequential: boolean;
  videoFilters: VideoFilterItem[];

  // Library
  libraryFolders: string[];
  /** Music library roots; scoped into the asset allowlist alongside `libraryFolders`. */
  musicLibraryFolders: string[];
  libraryDefaultSeeded: boolean;
  musicDefaultSeeded: boolean;
  scanOnStartup: boolean;
  includeHiddenFiles: boolean;
  fileTypes: FileTypeCategory;
  backgroundArtworkFetch: boolean;
  metadataNetworkLookup: boolean;

  // Network
  httpProxy: string;
  proxyUser: string;
  proxyPassword: string;
  cacheSizeMB: number;
  timeoutMs: string;
  userAgent: string;
  cookies: boolean;
  preferIPv6: boolean;

  // Performance
  threadCount: string;
  realTimePriority: boolean;
  memoryCopyOptimization: boolean;
  gpuAcceleration: boolean;
  hdrTonemapping: string;
  frameDropThreshold: number;

  // Recording
  recordingDirectory: string;
  recordingFormat: string;
  videoCodec: string;
  audioCodec: string;
  bitrateMode: string;
  videoBitrateKbps: string;
  audioBitrateKbps: string;

  // Extensions
  loadedExtensions: ExtensionItem[];
  luaScriptsDirectory: string;
  scriptSecurity: string;
}

/**
 * Preamp plus libvlc 3.0.24's ten ISO bands
 * (`libvlc_audio_equalizer_get_band_frequency`).
 * Index 0 of `eqGains` is the preamp; the rest follow this list.
 */
export const EQ_BANDS: EqualizerBand[] = [
  { id: 'preamp', label: 'Preamp', min: -20, max: 20 },
  { id: '31.25', label: '31.25 Hz', min: -20, max: 20 },
  { id: '62.5', label: '62.5 Hz', min: -20, max: 20 },
  { id: '125', label: '125 Hz', min: -20, max: 20 },
  { id: '250', label: '250 Hz', min: -20, max: 20 },
  { id: '500', label: '500 Hz', min: -20, max: 20 },
  { id: '1000', label: '1 kHz', min: -20, max: 20 },
  { id: '2000', label: '2 kHz', min: -20, max: 20 },
  { id: '4000', label: '4 kHz', min: -20, max: 20 },
  { id: '8000', label: '8 kHz', min: -20, max: 20 },
  { id: '16000', label: '16 kHz', min: -20, max: 20 },
];

export { EQ_LAYOUT_ID } from '../lib/settingsPersistence';

export const EQ_PRESET_NAMES = ['None', 'Flat', 'Rock', 'Jazz', 'Classical', 'Podcast'] as const;

/**
 * Preamp followed by the ten ISO bands.
 *
 * Flat, Rock, and Classical are libvlc 3.0.24's presets of the same name
 * (`libvlc_audio_equalizer_new_from_preset`). Flat's preamp is +12 dB with
 * every band at 0; on this equalizer that is unity, because the filter
 * scales input by 0.25. None zeros the preamp and the bands.
 * Jazz and Podcast are local curves written for these frequencies.
 */
export const EQ_PRESETS: Record<(typeof EQ_PRESET_NAMES)[number], readonly number[]> = {
  None: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Flat: [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Rock: [5, 8, 4.8, -5.6, -8, -3.2, 4, 8.8, 11.2, 11.2, 11.2],
  Jazz: [12, 3, 4, 2, -1, -2, -1, 2, 3, 3, 2],
  Classical: [12, 0, 0, 0, 0, 0, 0, -7.2, -7.2, -7.2, -9.6],
  Podcast: [12, -4, -2, -1, -2, 1, 2, 4, 3, 1, -2],
};

export const ACCENT_COLORS = [
  { color: '#D37918', label: 'Orange' },
  { color: '#C24A3A', label: 'Red' },
  { color: '#B08A2E', label: 'Gold' },
  { color: '#4C9A5A', label: 'Green' },
  { color: '#3E8E8E', label: 'Teal' },
  { color: '#3A6FC2', label: 'Blue' },
  { color: '#4B57C7', label: 'Indigo' },
  { color: '#8A44D0', label: 'Purple' },
  { color: '#C2479A', label: 'Pink' },
  { color: '#8F8F8F', label: 'Gray' },
];

export const DEFAULT_HOTKEYS: HotkeyAction[] = [
  { action: 'Play / Pause', shortcut: 'Space' },
  { action: 'Stop', shortcut: 'S' },
  { action: 'Previous', shortcut: 'P' },
  { action: 'Next', shortcut: 'N' },
  { action: 'Fullscreen', shortcut: 'F' },
  { action: 'Mute', shortcut: 'M' },
  { action: 'Volume Up', shortcut: '↑' },
  { action: 'Volume Down', shortcut: '↓' },
  { action: 'Seek Forward 5s', shortcut: '→' },
  { action: 'Seek Backward 5s', shortcut: '←' },
  { action: 'Seek Forward 60s', shortcut: 'Ctrl+→' },
  { action: 'Seek Backward 60s', shortcut: 'Ctrl+←' },
];

const DEFAULT_VIDEO_FILTERS: VideoFilterItem[] = [
  { name: 'Crop', enabled: false },
  { name: 'Rotate', enabled: false },
  { name: 'Colors', enabled: false },
  { name: 'Sharpen', enabled: false },
  { name: 'Denoise', enabled: false },
  { name: 'Logo', enabled: false },
  { name: 'Marquee', enabled: false },
  { name: 'Scene', enabled: false },
];

const DEFAULT_FILE_TYPES: FileTypeCategory = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts', 'm2ts', 'mpg', 'mpeg'],
  audio: ['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a', 'wma', 'opus', 'ape'],
  playlist: ['m3u', 'm3u8', 'pls', 'xspf'],
  subtitle: ['srt', 'sub', 'ass', 'ssa', 'vtt', 'idx', 'txt'],
};

const DEFAULT_EXTENSIONS: ExtensionItem[] = [
  { name: 'Subtitle Downloader', version: '1.2.0', author: 'VideoLAN', enabled: true },
  { name: 'YouTube Playlist', version: '0.9.4', author: 'Community', enabled: true },
  { name: 'Podcast Manager', version: '1.0.1', author: 'VideoLAN', enabled: false },
  { name: 'Lyrics Fetcher', version: '0.8.2', author: 'Community', enabled: false },
];

export const defaultSettings: SettingsState = {
  interfaceLanguage: 'English',
  theme: 'dark',
  accentColor: '#D37918',

  confirmationDialogs: false,
  automaticUpdates: false,

  developerMode: false,
  saveLog: true,
  logFile: '',
  logDetails: 'Errors only',

  equalizer: false,
  equalizerPreset: 'None',
  equalizerOpen: true,
  eqLayout: EQ_LAYOUT_ID,
  eqGains: [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  twoPass: false,
  spatialAudio: false,
  spatialAudioMode: 'Headphone virtualization',
  stereoWidening: false,

  subtitleTrack: '1',
  subtitleLanguage: 'English',
  subtitleDelay: '-4.000 s',
  subtitleSpeed: '1.000 fps',
  subtitleDurationFactor: '0.000',
  embeddedSubFormat: false,
  subtitleFont: 'Inter',
  subtitleTextColor: '#B8B8B8',
  subtitleOutlineColor: '#0E0E0E',
  subtitlePresetOpen: true,

  // Subtitle matching
  matchSubtitlesByFilename: true,
  preferForcedSubtitles: false,
  autoLoadSubtitlesFromFolder: true,
  subtitleLanguagePriority: 'English',

  // Interface
  minimizeToTray: true,
  showSystrayIcon: true,
  singleInstance: false,
  showRemainingTime: true,
  fileCachingMs: '300',

  // Window chrome
  useSystemTitleBar: false,

  // Privacy
  allowNetworkAccess: true,
  sendUsageStats: false,
  checkUpdatesAutomatically: false,

  // Controls
  hotkeys: [...DEFAULT_HOTKEYS],

  // Playback
  skipFrames: true,
  dropLateFrames: true,
  hardwareDecoding: 'Automatic',
  hardwareDecodingEnabled: true,
  allowSpeedPlayback: true,
  defaultPlaybackSpeed: '1.0x',
  loopMode: 'off',
  resumePlayback: true,
  // HTML5 stays the default backend; native requires the libvlc desktop build.
  nativePlayback: false,

  // Video
  outputModule: 'Automatic',
  deinterlaceMode: 'Auto',
  deinterlace: true,
  postProcessingLevel: 6,
  snapshotDirectory: '',
  snapshotFormat: 'png',
  snapshotSequential: true,
  videoFilters: [...DEFAULT_VIDEO_FILTERS],

  // Library
  libraryFolders: [],
  musicLibraryFolders: [],
  libraryDefaultSeeded: false,
  musicDefaultSeeded: false,
  scanOnStartup: true,
  includeHiddenFiles: false,
  fileTypes: { ...DEFAULT_FILE_TYPES },
  backgroundArtworkFetch: true,
  metadataNetworkLookup: true,

  // Network
  httpProxy: '',
  proxyUser: '',
  proxyPassword: '',
  cacheSizeMB: 50,
  timeoutMs: '10000',
  userAgent: 'Kanea/1.0',
  cookies: true,
  preferIPv6: false,

  // Performance
  threadCount: 'Auto',
  realTimePriority: true,
  memoryCopyOptimization: true,
  gpuAcceleration: true,
  hdrTonemapping: 'Auto',
  frameDropThreshold: 5,

  // Recording
  recordingDirectory: '',
  recordingFormat: 'MP4',
  videoCodec: 'H.264',
  audioCodec: 'AAC',
  bitrateMode: 'CBR',
  videoBitrateKbps: '2000',
  audioBitrateKbps: '128',

  // Extensions
  loadedExtensions: [...DEFAULT_EXTENSIONS],
  luaScriptsDirectory: '',
  scriptSecurity: 'Safe',
};

/**
 * Canonical defaults, also used by settings profiles to build the built-in
 * read-only "Default" profile. Kept as an alias so existing imports of
 * `defaultSettings` keep working.
 */
export const DEFAULT_SETTINGS: SettingsState = defaultSettings;

export const settings = writable<SettingsState>(loadSettings(defaultSettings));

// Resolves once the desktop SQLite snapshot has been applied (or immediately
// in the browser preview). Library bootstrap awaits this so the asset-protocol
// scope is synced before the first scan/probe creates `asset://` URLs.
let resolveSettingsHydrated: () => void = () => {};
export const settingsHydrated: Promise<void> = hasTauri()
  ? new Promise<void>((resolve) => {
      resolveSettingsHydrated = resolve;
    })
  : Promise.resolve();

// Persist changes only. Boot emissions — the initial value and the async
// SQLite hydration below — bypass this reaction so nothing is written back.
let bypassPersistence = true;
let changedSinceBoot = false;
// Track the last combined (video + music) folder list so the asset scope is
// synced only when either list actually changes.
let lastSyncedScopedFolders: string[] | null = null;

/**
 * Combined asset-protocol scope: video library roots plus music library roots,
 * deduped so a folder configured in both lists is allowed exactly once.
 */
export function scopedLibraryFolders(
  state: Pick<SettingsState, 'libraryFolders' | 'musicLibraryFolders'>,
): string[] {
  return Array.from(new Set([...state.libraryFolders, ...state.musicLibraryFolders]));
}

settings.subscribe((state) => {
  if (bypassPersistence) return;
  changedSinceBoot = true;
  scheduleSettingsSave(state);

  // Reactive sync: whenever the combined library roots change (user edits to
  // either the video or the music list), update the asset-protocol scope.
  // Idempotent; no-op in browser preview.
  if (hasTauri()) {
    const folders = scopedLibraryFolders(state);
    if (lastSyncedScopedFolders === null || folders.join('\0') !== lastSyncedScopedFolders.join('\0')) {
      lastSyncedScopedFolders = [...folders];
      void syncLibraryAssetScope(folders);
    }
  }
});

// Desktop shell: swap in the SQLite snapshot once resolved (legacy webview
// storage is migrated on this first pass). Live edits that beat the load
// window win and the snapshot is dropped, so nothing user-made is overwritten.
if (hasTauri()) {
  let scopeSyncAfterHydration: Promise<void> | null = null;
  void hydrateSettings(
    defaultSettings,
    (state) => {
      bypassPersistence = true;
      settings.set(state);
      bypassPersistence = false;
      // Sync scope immediately after hydration applies. The hydration promise
      // (awaited by library bootstrap) resolves only after this sync completes,
      // ensuring roots are allowed before any toFileSrc/probe/scan.
      const scoped = scopedLibraryFolders(state);
      lastSyncedScopedFolders = [...scoped];
      scopeSyncAfterHydration = syncLibraryAssetScope(scoped);
    },
    () => changedSinceBoot,
  ).then(async () => {
    // If hydration discarded the snapshot (live changes or no data), still
    // sync scope for the current state and unblock bootstrap.
    if (scopeSyncAfterHydration) {
      await scopeSyncAfterHydration;
    } else if (lastSyncedScopedFolders === null) {
      const current = get(settings);
      const scoped = scopedLibraryFolders(current);
      lastSyncedScopedFolders = [...scoped];
      await syncLibraryAssetScope(scoped);
    }
    resolveSettingsHydrated();
  });
}

/** Deep clone of the defaults, safe to hand to `settings.set` (including nested arrays). */
export function createDefaultSettings(): SettingsState {
  return JSON.parse(JSON.stringify(defaultSettings)) as SettingsState;
}

/** Restore every setting to its default value. */
export function resetSettings(): void {
  settings.set(createDefaultSettings());
}

/**
 * Validate imported JSON with the same merge/validation rules as persisted
 * settings, then apply it. Returns the applied state for callers that need it.
 */
export function importSettingsFromJson(json: string): SettingsState {
  const next = parseSettingsJson(json, defaultSettings);
  settings.set(next);
  return next;
}

export function setEqualizerGain(index: number, gain: number): void {
  settings.update((state) => ({
    ...state,
    eqGains: state.eqGains.map((current, i) => (i === index ? gain : current)),
  }));
}

/** Load a named preset into the preamp and the ten ISO bands. */
export function applyEqualizerPreset(name: string): void {
  const gains = EQ_PRESETS[name as (typeof EQ_PRESET_NAMES)[number]];
  if (!gains) return;
  settings.update((state) => ({
    ...state,
    equalizerPreset: name,
    eqLayout: EQ_LAYOUT_ID,
    eqGains: [...gains],
  }));
}

export function toggleSetting(key: 'equalizerOpen' | 'subtitlePresetOpen'): void {
  settings.update((state) => ({ ...state, [key]: !state[key] }));
}

export function resetHotkeysToDefault(): void {
  settings.update((state) => ({ ...state, hotkeys: [...DEFAULT_HOTKEYS] }));
}

export function addHotkey(action: string, shortcut: string): void {
  settings.update((state) => ({ ...state, hotkeys: [...state.hotkeys, { action, shortcut }] }));
}

export function removeHotkey(index: number): void {
  settings.update((state) => ({ ...state, hotkeys: state.hotkeys.filter((_, i) => i !== index) }));
}

export function updateHotkey(index: number, shortcut: string): void {
  settings.update((state) => ({
    ...state,
    hotkeys: state.hotkeys.map((h, i) => (i === index ? { ...h, shortcut } : h)),
  }));
}

export function addLibraryFolder(folder: string): void {
  settings.update((state) => ({ ...state, libraryFolders: [...state.libraryFolders, folder] }));
}

export function removeLibraryFolder(index: number): void {
  settings.update((state) => ({
    ...state,
    libraryFolders: state.libraryFolders.filter((_, i) => i !== index),
  }));
}

export function moveLibraryFolder(fromIndex: number, toIndex: number): void {
  settings.update((state) => {
    const folders = [...state.libraryFolders];
    const [removed] = folders.splice(fromIndex, 1);
    folders.splice(toIndex, 0, removed);
    return { ...state, libraryFolders: folders };
  });
}

export function addMusicLibraryFolder(folder: string): void {
  settings.update((state) => ({
    ...state,
    musicLibraryFolders: [...state.musicLibraryFolders, folder],
  }));
}

export function removeMusicLibraryFolder(index: number): void {
  settings.update((state) => ({
    ...state,
    musicLibraryFolders: state.musicLibraryFolders.filter((_, i) => i !== index),
  }));
}

export function moveMusicLibraryFolder(fromIndex: number, toIndex: number): void {
  settings.update((state) => {
    const folders = [...state.musicLibraryFolders];
    const [removed] = folders.splice(fromIndex, 1);
    folders.splice(toIndex, 0, removed);
    return { ...state, musicLibraryFolders: folders };
  });
}

export function addVideoFilter(name: string): void {
  settings.update((state) => ({
    ...state,
    videoFilters: [...state.videoFilters, { name, enabled: false }],
  }));
}

export function toggleVideoFilter(index: number): void {
  settings.update((state) => ({
    ...state,
    videoFilters: state.videoFilters.map((f, i) =>
      i === index ? { ...f, enabled: !f.enabled } : f,
    ),
  }));
}

export function removeVideoFilter(index: number): void {
  settings.update((state) => ({
    ...state,
    videoFilters: state.videoFilters.filter((_, i) => i !== index),
  }));
}

export function addExtension(ext: ExtensionItem): void {
  settings.update((state) => ({ ...state, loadedExtensions: [...state.loadedExtensions, ext] }));
}

export function removeExtension(index: number): void {
  settings.update((state) => ({
    ...state,
    loadedExtensions: state.loadedExtensions.filter((_, i) => i !== index),
  }));
}

export function toggleExtension(index: number): void {
  settings.update((state) => ({
    ...state,
    loadedExtensions: state.loadedExtensions.map((e, i) =>
      i === index ? { ...e, enabled: !e.enabled } : e,
    ),
  }));
}