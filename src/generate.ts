import { DARK_THEME, LIGHT_THEME } from './color/theme.ts';
import type { ConfigIssue } from './config/issues.ts';
import { loadTimeline } from './config/load.ts';
import { layout } from './layout/layout.ts';
import type { LayoutMetrics } from './layout/metrics.ts';
import { renderSvg } from './render/svg.ts';
import { ok, type Result } from './result.ts';

export interface RenderedMap {
  readonly light: string;
  readonly dark: string;
}

/** Config source text in, light and dark SVG documents out. */
export function generate(
  source: string,
  options: Partial<LayoutMetrics> = {},
): Result<RenderedMap, readonly ConfigIssue[]> {
  const timeline = loadTimeline(source);
  if (!timeline.ok) return timeline;
  const geometry = layout(timeline.value, options);
  return ok({ light: renderSvg(geometry, LIGHT_THEME), dark: renderSvg(geometry, DARK_THEME) });
}
