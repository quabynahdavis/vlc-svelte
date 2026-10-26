import { writable } from 'svelte/store';

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

  // Interface
  minimizeToTray: boolean;
  showSystrayIcon: boolean;
  singleInstance: boolean;
  showRemainingTime: boolean;
  fileCachingMs: string;

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
  allowSpeedPlayback: boolean;
  defaultPlaybackSpeed: string;
  loopMode: string;
  resumePlayback: boolean;

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

export const EQ_BANDS: EqualizerBand[] = [
  { id: 'preamp', label: 'Preamp', min: -20, max: 20 },
  { id: '60', label: '60 Hz', min: -20, max: 20 },
  { id: '170', label: '170 Hz', min: -20, max: 20 },
  { id: '310', label: '310 Hz', min: -20, max: 20 },
  { id: '600', label: '600 Hz', min: -20, max: 20 },
  { id: '1k', label: '1 KHz', min: -20, max: 20 },
  { id: '3k', label: '3 KHz', min: -20, max: 20 },
  { id: '6k', label: '6 KHz', min: -20, max: 20 },
  { id: '12k', label: '12 KHz', min: -20, max: 20 },
  { id: '14k', label: '14 KHz', min: -20, max: 20 },
  { id: '16k', label: '16 KHz', min: -20, max: 20 },
];

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

const DEFAULT_HOTKEYS: HotkeyAction[] = [
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

  // Interface
  minimizeToTray: true,
  showSystrayIcon: true,
  singleInstance: false,
  showRemainingTime: true,
  fileCachingMs: '300',

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
  allowSpeedPlayback: true,
  defaultPlaybackSpeed: '1.0x',
  loopMode: 'off',
  resumePlayback: true,

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
  userAgent: 'VLC/3.0',
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

export const settings = writable<SettingsState>({ ...defaultSettings });

export function setEqualizerGain(index: number, gain: number): void {
  settings.update((state) => ({
    ...state,
    eqGains: state.eqGains.map((current, i) => (i === index ? gain : current)),
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