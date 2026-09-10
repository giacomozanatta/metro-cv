import { ensureContrast } from './oklch.ts';
import { blend } from './rgb.ts';

export interface Theme {
  readonly name: 'light' | 'dark';
  readonly background: string;
  readonly text: string;
  readonly muted: string;
}

// GitHub's own canvas and foreground colours, so the map sits naturally in a README.
export const LIGHT_THEME: Theme = {
  name: 'light',
  background: '#ffffff',
  text: '#1f2328',
  muted: '#59636e',
};

export const DARK_THEME: Theme = {
  name: 'dark',
  background: '#0d1117',
  text: '#e6edf3',
  muted: '#9198a1',
};

/** WCAG minimum for graphical objects and for normal-size text. */
const MIN_GRAPHIC_CONTRAST = 3;
const MIN_TEXT_CONTRAST = 4.5;

export interface LinePalette {
  readonly stroke: string;
  /** Period text, which is small and therefore held to the text contrast minimum. */
  readonly period: string;
  readonly chipFill: string;
  readonly chipStroke: string;
}

/**
 * Colours for one line in one theme. The light theme uses the configured colour as is; the dark
 * theme uses `darkColor`, or derives one that stays visible on the dark background.
 */
export function linePalette(
  line: { readonly color: string; readonly darkColor?: string },
  theme: Theme,
): LinePalette {
  const stroke =
    theme.name === 'light'
      ? line.color
      : (line.darkColor ?? ensureContrast(line.color, theme.background, MIN_GRAPHIC_CONTRAST));
  return {
    stroke,
    period: ensureContrast(stroke, theme.background, MIN_TEXT_CONTRAST),
    chipFill: blend(stroke, theme.background, 0.14),
    chipStroke: blend(stroke, theme.background, 0.5),
  };
}
