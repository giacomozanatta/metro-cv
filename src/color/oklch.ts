import { contrastRatio, relativeLuminance } from './contrast.ts';
import { parseHex, toHex, type Rgb } from './rgb.ts';

/** OKLCH: perceptual lightness (0..1), chroma and hue (radians). */
interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const SEARCH_STEPS = 24;

/**
 * Returns `color` unchanged if it already reaches `minRatio` against `background`; otherwise the
 * closest colour with the same hue that does, moving lightness away from the background. Working
 * in OKLCH keeps the line recognisably "the same colour", unlike mixing towards white or black.
 */
export function ensureContrast(color: string, background: string, minRatio: number): string {
  if (contrastRatio(color, background) >= minRatio) return color;

  const start = toOklch(parseHex(color));
  const target = relativeLuminance(parseHex(background)) > 0.18 ? 0 : 1;
  const candidate = (t: number) =>
    toHex(intoGamut({ ...start, l: start.l + (target - start.l) * t }));

  // Binary search for the smallest lightness change that is enough.
  let low = 0;
  let high = 1;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (low + high) / 2;
    if (contrastRatio(candidate(mid), background) >= minRatio) high = mid;
    else low = mid;
  }
  return candidate(high);
}

function toOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function fromOklch({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/** Reduces chroma (keeping lightness and hue) until the colour fits in sRGB. */
function intoGamut(color: Oklch): Rgb {
  const exact = fromOklch(color);
  if (inGamut(exact)) return exact;
  let low = 0;
  let high = color.c;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (low + high) / 2;
    if (inGamut(fromOklch({ ...color, c: mid }))) low = mid;
    else high = mid;
  }
  return fromOklch({ ...color, c: low });
}

function inGamut({ r, g, b }: Rgb): boolean {
  const epsilon = 1e-6;
  return [r, g, b].every((channel) => channel >= -epsilon && channel <= 1 + epsilon);
}

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055;
}
