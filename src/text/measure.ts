import { HELVETICA_BOLD, HELVETICA_EXTRA, HELVETICA_REGULAR } from './helvetica.ts';

export interface TextStyle {
  readonly size: number;
  readonly weight: 'regular' | 'bold';
  readonly monospace?: boolean;
}

// SVG rendered as an <img> has no way to measure text, and GitHub shows it with whatever
// sans-serif the viewer has. Widths are estimated from Helvetica metrics and padded, because
// system UI fonts (San Francisco, Segoe UI) run slightly wider. Overestimating only costs a little
// whitespace; underestimating would clip text.
const PROPORTIONAL_SAFETY = 1.08;
const FALLBACK_ADVANCE = 556;
const MONOSPACE_ADVANCE = 0.61;
const WIDE_ADVANCE = 1000;

/** Estimated rendered width of `text` in pixels. */
export function measureText(text: string, style: TextStyle): number {
  let em = 0;
  for (const char of text) {
    em += style.monospace ? monospaceAdvance(char) : proportionalAdvance(char, style.weight) / 1000;
  }
  return em * style.size * (style.monospace ? 1 : PROPORTIONAL_SAFETY);
}

function proportionalAdvance(char: string, weight: TextStyle['weight']): number {
  const extra = HELVETICA_EXTRA.get(char);
  if (extra) return weight === 'bold' ? extra[1] : extra[0];

  // Accented Latin letters are as wide as their base letter: "è" measures like "e".
  const base = char.normalize('NFD').codePointAt(0) ?? 0;
  const table = weight === 'bold' ? HELVETICA_BOLD : HELVETICA_REGULAR;
  const width = table[base - 0x20];
  if (width !== undefined) return width;
  return isWide(char) ? WIDE_ADVANCE : FALLBACK_ADVANCE;
}

function monospaceAdvance(char: string): number {
  return isWide(char) ? 2 * MONOSPACE_ADVANCE : MONOSPACE_ADVANCE;
}

/** East Asian wide characters and emoji, which take a full em (two cells in monospace). */
function isWide(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}
