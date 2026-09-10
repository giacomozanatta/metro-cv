import { describe, expect, it } from 'vitest';
import { measureText } from '../src/text/measure.ts';

const regular = { size: 10, weight: 'regular' } as const;
const bold = { size: 10, weight: 'bold' } as const;

describe('measureText', () => {
  it('is zero for empty text and grows with content', () => {
    expect(measureText('', regular)).toBe(0);
    expect(measureText('Java', regular)).toBeLessThan(measureText('JavaScript', regular));
  });

  it('uses Helvetica advance widths with a safety margin', () => {
    // "a" is 556/1000 em in Helvetica.
    expect(measureText('a', regular)).toBeCloseTo(0.556 * 10 * 1.08, 6);
  });

  it('measures accented letters like their base letter', () => {
    expect(measureText('è', regular)).toBe(measureText('e', regular));
  });

  it('measures bold at least as wide as regular', () => {
    const text = 'Software Consultant & Software Engineer';
    expect(measureText(text, bold)).toBeGreaterThanOrEqual(measureText(text, regular));
  });

  it('gives monospace text a fixed advance and wide characters two cells', () => {
    const mono = { size: 10, weight: 'regular', monospace: true } as const;
    expect(measureText('CI/CD', mono)).toBeCloseTo(5 * 6.1, 6);
    expect(measureText('日本', mono)).toBeCloseTo(4 * 6.1, 6);
  });
});
