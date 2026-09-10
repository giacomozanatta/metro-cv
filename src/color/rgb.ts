/** A gamma-encoded sRGB colour with channels in 0..1. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  const [, r = '', g = '', b = ''] = match;
  return { r: parseInt(r, 16) / 255, g: parseInt(g, 16) / 255, b: parseInt(b, 16) / 255 };
}

/** Lower-case `#rrggbb`; channels outside 0..1 are clamped. */
export function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Blends `color` over `background` at the given opacity. Used instead of SVG opacity so every
 * renderer produces exactly the same tint.
 */
export function blend(color: string, background: string, opacity: number): string {
  const top = parseHex(color);
  const bottom = parseHex(background);
  const over = (a: number, b: number) => a * opacity + b * (1 - opacity);
  return toHex({ r: over(top.r, bottom.r), g: over(top.g, bottom.g), b: over(top.b, bottom.b) });
}
