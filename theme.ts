export type ThemeSettings = {
  primary: string;
  accent: string;
  background: string;
};

const STORAGE_KEY = 'pawlished_theme';

export const DEFAULT_THEME: ThemeSettings = {
  primary: '#2563eb',
  accent: '#10b981',
  background: '#f3f4f6'
};

const clamp = (value: number) => Math.max(0, Math.min(255, value));

const normalizeHex = (hex: string) => {
  if (!hex) return '#000000';
  let value = hex.trim();
  if (value[0] !== '#') value = `#${value}`;
  if (value.length === 4) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value.toUpperCase();
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex).replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((value) => clamp(Math.round(value)).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();

const mix = (color: string, target: string, weight: number) => {
  const c = hexToRgb(color);
  const t = hexToRgb(target);
  const r = c.r + (t.r - c.r) * weight;
  const g = c.g + (t.g - c.g) * weight;
  const b = c.b + (t.b - c.b) * weight;
  return rgbToHex(r, g, b);
};

const lighten = (color: string, amount: number) => mix(color, '#FFFFFF', amount);
const darken = (color: string, amount: number) => mix(color, '#000000', amount);

const buildScale = (base: string) => {
  const primary = normalizeHex(base);
  return {
    50: lighten(primary, 0.88),
    100: lighten(primary, 0.78),
    200: lighten(primary, 0.64),
    300: lighten(primary, 0.5),
    500: primary,
    600: darken(primary, 0.1),
    700: darken(primary, 0.2)
  };
};

const setVar = (name: string, value: string) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(name, value);
};

const setRgbVar = (name: string, hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  setVar(name, `${r}, ${g}, ${b}`);
};

export const applyTheme = (theme: ThemeSettings) => {
  if (typeof document === 'undefined') return;
  const brand = buildScale(theme.primary);
  const accent = buildScale(theme.accent);

  setVar('--brand-50', brand[50]);
  setVar('--brand-100', brand[100]);
  setVar('--brand-200', brand[200]);
  setVar('--brand-300', brand[300]);
  setVar('--brand-500', brand[500]);
  setVar('--brand-600', brand[600]);
  setVar('--brand-700', brand[700]);

  setRgbVar('--brand-50-rgb', brand[50]);
  setRgbVar('--brand-100-rgb', brand[100]);
  setRgbVar('--brand-200-rgb', brand[200]);
  setRgbVar('--brand-300-rgb', brand[300]);
  setRgbVar('--brand-500-rgb', brand[500]);

  setVar('--accent-50', accent[50]);
  setVar('--accent-100', accent[100]);
  setVar('--accent-200', accent[200]);
  setVar('--accent-300', accent[300]);
  setVar('--accent-500', accent[500]);
  setVar('--accent-600', accent[600]);
  setVar('--accent-700', accent[700]);

  setRgbVar('--accent-50-rgb', accent[50]);
  setRgbVar('--accent-100-rgb', accent[100]);
  setRgbVar('--accent-200-rgb', accent[200]);
  setRgbVar('--accent-300-rgb', accent[300]);
  setRgbVar('--accent-500-rgb', accent[500]);
  setRgbVar('--accent-600-rgb', accent[600]);
  setRgbVar('--accent-700-rgb', accent[700]);

  setVar('--app-bg', normalizeHex(theme.background));
};

export const loadTheme = (): ThemeSettings => {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    return {
      primary: parsed.primary || DEFAULT_THEME.primary,
      accent: parsed.accent || DEFAULT_THEME.accent,
      background: parsed.background || DEFAULT_THEME.background
    };
  } catch {
    return DEFAULT_THEME;
  }
};

export const saveTheme = (theme: ThemeSettings) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // ignore storage errors
  }
};
