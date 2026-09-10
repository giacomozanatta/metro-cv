import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/color/contrast.ts';
import { ensureContrast } from '../src/color/oklch.ts';
import { blend, parseHex, toHex } from '../src/color/rgb.ts';
import { DARK_THEME, LIGHT_THEME, linePalette } from '../src/color/theme.ts';

const hexColor = fc
  .tuple(fc.nat(255), fc.nat(255), fc.nat(255))
  .map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`);

describe('rgb', () => {
  it('round-trips hex colours', () => {
    fc.assert(
      fc.property(hexColor, (hex) => {
        expect(toHex(parseHex(hex))).toBe(hex);
      }),
    );
  });

  it('blends like an opaque overlay', () => {
    expect(blend('#ff0000', '#ffffff', 0.5)).toBe('#ff8080');
    expect(blend('#123456', '#abcdef', 1)).toBe('#123456');
    expect(blend('#123456', '#abcdef', 0)).toBe('#abcdef');
  });

  it('rejects anything but #rrggbb', () => {
    expect(() => parseHex('#fff')).toThrow();
  });
});

describe('contrast', () => {
  it('matches the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('leaves colours that already contrast enough untouched', () => {
    expect(ensureContrast('#1e3a8a', '#ffffff', 4.5)).toBe('#1e3a8a');
  });

  it('lifts navy until it shows on a dark background', () => {
    const lifted = ensureContrast('#1e3a8a', DARK_THEME.background, 3);
    expect(lifted).not.toBe('#1e3a8a');
    expect(contrastRatio(lifted, DARK_THEME.background)).toBeGreaterThanOrEqual(3);
  });
});

describe('linePalette', () => {
  it('uses the configured colour and darkColor verbatim', () => {
    const line = { color: '#ff9900', darkColor: '#123456' };
    expect(linePalette(line, LIGHT_THEME).stroke).toBe('#ff9900');
    expect(linePalette(line, DARK_THEME).stroke).toBe('#123456');
  });

  it('keeps derived lines and all period text readable in both themes', () => {
    fc.assert(
      fc.property(hexColor, (color) => {
        const dark = linePalette({ color }, DARK_THEME);
        expect(contrastRatio(dark.stroke, DARK_THEME.background)).toBeGreaterThanOrEqual(3);
        for (const theme of [LIGHT_THEME, DARK_THEME]) {
          const { period } = linePalette({ color }, theme);
          expect(contrastRatio(period, theme.background)).toBeGreaterThanOrEqual(4.5);
        }
      }),
    );
  });
});
