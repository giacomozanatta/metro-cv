import { parseHex, type Rgb } from './rgb.ts';

/** WCAG 2 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
