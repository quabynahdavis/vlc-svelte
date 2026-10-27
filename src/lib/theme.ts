/**
 * Runtime appearance side effects for the settings store.
 *
 * The accent is exposed as CSS custom properties on the document root so
 * Tailwind tokens (`vlc-orange`, `vlc-orangeDark`, ...) and plain CSS can
 * follow the user's choice without rebuilding styles. `data-theme` and
 * `color-scheme` are hints only: the app still ships a dark palette.
 */

export const DEFAULT_ACCENT_COLOR = '#D37918';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Darkening factors that reproduce the original orange accent ramp. */
const PRESSED_FACTOR = 0.81;
const DEEPEST_FACTOR = 0.26;

const LANGUAGE_TAGS: Record<string, string> = {
  English: 'en',
  Français: 'fr',
  Deutsch: 'de',
  Español: 'es',
  Italiano: 'it',
  Português: 'pt',
  Русский: 'ru',
  中文: 'zh',
  日本語: 'ja',
  한국어: 'ko',
};

export interface AppearanceSettings {
  accentColor: string;
  interfaceLanguage: string;
  theme: string;
}

export interface AccentPalette {
  accent: string;
  accentRgb: string;
  pressed: string;
  pressedRgb: string;
  deepest: string;
  deepestRgb: string;
  gradient: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

function parseHexColor(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function scaleColor({ r, g, b }: Rgb, factor: number): Rgb {
  return {
    r: clampChannel(r * factor),
    g: clampChannel(g * factor),
    b: clampChannel(b * factor),
  };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function toRgbTriplet({ r, g, b }: Rgb): string {
  return `${r} ${g} ${b}`;
}

/** Build the full accent ramp (base, pressed, deepest, gradient) from a hex color. */
export function accentPalette(accentColor: string): AccentPalette {
  const accent = isHexColor(accentColor)
    ? accentColor.toLowerCase()
    : DEFAULT_ACCENT_COLOR.toLowerCase();
  const base = parseHexColor(accent);
  const pressed = scaleColor(base, PRESSED_FACTOR);
  const deepest = scaleColor(base, DEEPEST_FACTOR);

  return {
    accent,
    accentRgb: toRgbTriplet(base),
    pressed: toHex(pressed),
    pressedRgb: toRgbTriplet(pressed),
    deepest: toHex(deepest),
    deepestRgb: toRgbTriplet(deepest),
    gradient: `linear-gradient(135deg, ${toHex(pressed)} 0%, ${accent} 100%)`,
  };
}

/** Map the display-name language options to BCP 47 tags for `<html lang>`. */
export function languageTag(interfaceLanguage: string): string {
  const value = interfaceLanguage.trim();
  const known = LANGUAGE_TAGS[value];
  if (known) return known;
  if (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/i.test(value)) return value.toLowerCase();
  return 'en';
}

function resolveTheme(theme: string): 'dark' | 'light' {
  if (theme === 'light') return 'light';
  if (theme === 'system') {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
  return 'dark';
}

let lastAppearance: AppearanceSettings | null = null;

/**
 * Apply accent/language/theme hints to the document. Safe to call repeatedly;
 * every settings mutation (including reset and import) should end up here.
 */
export function applyAppearance(settings: AppearanceSettings): void {
  if (typeof document === 'undefined') return;

  lastAppearance = {
    accentColor: settings.accentColor,
    interfaceLanguage: settings.interfaceLanguage,
    theme: settings.theme,
  };

  const root = document.documentElement;
  const palette = accentPalette(settings.accentColor);

  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-rgb', palette.accentRgb);
  root.style.setProperty('--accent-pressed', palette.pressed);
  root.style.setProperty('--accent-pressed-rgb', palette.pressedRgb);
  root.style.setProperty('--accent-deepest', palette.deepest);
  root.style.setProperty('--accent-deepest-rgb', palette.deepestRgb);
  root.style.setProperty('--accent-gradient', palette.gradient);

  root.lang = languageTag(settings.interfaceLanguage);

  const resolvedTheme = resolveTheme(settings.theme);
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = settings.theme;
  root.style.colorScheme = resolvedTheme;
}

// Follow OS theme changes while "System" is selected.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = (): void => {
    if (lastAppearance && lastAppearance.theme === 'system') {
      applyAppearance(lastAppearance);
    }
  };

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleSystemThemeChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(handleSystemThemeChange);
  }
}
