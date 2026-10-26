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
  subtitleOutlineColor: '#0C0C0C',
  subtitlePresetOpen: true,
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
