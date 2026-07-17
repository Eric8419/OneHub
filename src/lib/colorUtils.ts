const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('');
  }
  return '#' + h.toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function mix(hex: string, target: [number, number, number], ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (target[0] - r) * ratio,
    g + (target[1] - g) * ratio,
    b + (target[2] - b) * ratio,
  );
}

function lighten(hex: string, amount: number): string {
  return mix(hex, [255, 255, 255], amount);
}

function darken(hex: string, amount: number): string {
  return mix(hex, [0, 0, 0], amount);
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface BrandPalette {
  brand: string;
  brandHover: string;
  brandActive: string;
  brandDisabled: string;
  brandPopup: string;
  brand50: string;
  brand100: string;
  brand200: string;
  brand300: string;
  brand400: string;
  brand500: string;
  brand600: string;
  brand700: string;
  brand800: string;
  brand900: string;
}

export function generateBrandPalette(hex: string, isDark: boolean): BrandPalette {
  const base = normalizeHex(hex);
  if (isDark) {
    return {
      brand: lighten(base, 0.15),
      brandHover: lighten(base, 0.25),
      brandActive: base,
      brandDisabled: withAlpha(lighten(base, 0.15), 0.3),
      brandPopup: withAlpha(lighten(base, 0.15), 0.2),
      brand50: darken(base, 0.75),
      brand100: darken(base, 0.6),
      brand200: darken(base, 0.45),
      brand300: darken(base, 0.25),
      brand400: lighten(base, 0.1),
      brand500: lighten(base, 0.2),
      brand600: lighten(base, 0.3),
      brand700: lighten(base, 0.45),
      brand800: lighten(base, 0.6),
      brand900: lighten(base, 0.75),
    };
  }
  return {
    brand: base,
    brandHover: lighten(base, 0.12),
    brandActive: darken(base, 0.1),
    brandDisabled: withAlpha(base, 0.22),
    brandPopup: withAlpha(lighten(base, 0.2), 0.36),
    brand50: lighten(base, 0.92),
    brand100: lighten(base, 0.85),
    brand200: lighten(base, 0.7),
    brand300: lighten(base, 0.45),
    brand400: lighten(base, 0.2),
    brand500: lighten(base, 0.08),
    brand600: base,
    brand700: darken(base, 0.1),
    brand800: darken(base, 0.25),
    brand900: darken(base, 0.4),
  };
}

export function applyAccentColor(hex: string, isDark: boolean): void {
  const root = document.documentElement;
  const p = generateBrandPalette(hex, isDark);
  root.style.setProperty('--bg-brand', p.brand);
  root.style.setProperty('--bg-brand-hover', p.brandHover);
  root.style.setProperty('--bg-brand-active', p.brandActive);
  root.style.setProperty('--bg-brand-disabled', p.brandDisabled);
  root.style.setProperty('--bg-brand-popup', p.brandPopup);
  root.style.setProperty('--text-brand', p.brand);
  root.style.setProperty('--text-brand-hover', p.brandHover);
  root.style.setProperty('--icon-brand', p.brand);
  root.style.setProperty('--border-brand', p.brand);
  root.style.setProperty('--brand-50', p.brand50);
  root.style.setProperty('--brand-100', p.brand100);
  root.style.setProperty('--brand-200', p.brand200);
  root.style.setProperty('--brand-300', p.brand300);
  root.style.setProperty('--brand-400', p.brand400);
  root.style.setProperty('--brand-500', p.brand500);
  root.style.setProperty('--brand-600', p.brand600);
  root.style.setProperty('--brand-700', p.brand700);
  root.style.setProperty('--brand-800', p.brand800);
  root.style.setProperty('--brand-900', p.brand900);
}
