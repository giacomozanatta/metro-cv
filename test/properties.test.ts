import fc from 'fast-check';
import { SyntaxValidator } from 'fast-xml-validator';
import { describe, expect, it } from 'vitest';
import { DARK_THEME, LIGHT_THEME } from '../src/color/theme.ts';
import { normalize } from '../src/config/normalize.ts';
import type { Config } from '../src/config/schema.ts';
import { findCrossings } from '../src/layout/crossings.ts';
import { assignLanes, type LineSpan } from '../src/layout/lanes.ts';
import { layout } from '../src/layout/layout.ts';
import { DEFAULT_METRICS } from '../src/layout/metrics.ts';
import { orderEvents } from '../src/layout/order.ts';
import type { Timeline } from '../src/model/timeline.ts';
import { renderSvg } from '../src/render/svg.ts';
import { configArbitrary } from './arbitraries.ts';
import { textContents, userStrings } from './svg.ts';

const RUNS = 300;

function normalized(config: Config): Timeline {
  const result = normalize(config);
  if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join('\n'));
  return result.value;
}

function contains(outer: LineSpan, inner: LineSpan): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

describe('for any valid career', () => {
  it('orders events consistently with dates and structure', () => {
    fc.assert(
      fc.property(configArbitrary, (config) => {
        const timeline = normalized(config);
        const events = orderEvents(timeline);
        const dates = events.map((event) =>
          event.kind === 'station'
            ? event.station.from
            : event.kind === 'branch'
              ? event.line.start
              : event.line.end,
        );
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1] ?? -Infinity);
        }

        const position = (kind: string, line: string) =>
          events.findIndex((event) => event.kind === kind && event.line.id === line);
        for (const line of timeline.lines) {
          if (line.parent === null) continue;
          const branch = position('branch', line.id);
          const merge = position('merge', line.id);
          const stations = events.flatMap((event, i) =>
            event.kind === 'station' && event.line.id === line.id ? [i] : [],
          );
          expect(stations).toHaveLength(line.stations.length);
          expect(Math.min(...stations)).toBeGreaterThan(branch);
          if (line.ongoing) expect(merge).toBe(-1);
          else expect(Math.max(...stations)).toBeLessThan(merge);

          if (line.parent !== 'main') {
            expect(position('branch', line.parent)).toBeLessThan(branch);
            const parentMerge = position('merge', line.parent);
            if (parentMerge !== -1) expect(merge).toBeLessThan(parentMerge);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('puts children right of their parents and never shares a lane at the same time', () => {
    fc.assert(
      fc.property(configArbitrary, (config) => {
        const timeline = normalized(config);
        const { laneOf, spanOf } = assignLanes(timeline, orderEvents(timeline));
        const lines = timeline.lines.filter((line) => line.parent !== null);
        for (const line of lines) {
          if (line.parent !== null) expect(laneOf(line.id)).toBeGreaterThan(laneOf(line.parent));
        }
        for (const a of lines) {
          for (const b of lines) {
            if (a.id >= b.id || laneOf(a.id) !== laneOf(b.id)) continue;
            const sa = spanOf(a.id);
            const sb = spanOf(b.id);
            expect(sa.end <= sb.start || sb.end <= sa.start).toBe(true);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('only crosses lines whose lifetimes partially overlap', () => {
    fc.assert(
      fc.property(configArbitrary, (config) => {
        const timeline = normalized(config);
        const events = orderEvents(timeline);
        const assignment = assignLanes(timeline, events);
        for (const crossing of findCrossings(events, assignment)) {
          const over = assignment.spanOf(crossing.line);
          const under = assignment.spanOf(crossing.under);
          expect(contains(over, under) || contains(under, over)).toBe(false);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('renders well-formed SVG that only contains the user’s own words', () => {
    fc.assert(
      fc.property(configArbitrary, (config) => {
        const geometry = layout(normalized(config));
        const allowed = userStrings(config);
        for (const theme of [LIGHT_THEME, DARK_THEME]) {
          const svg = renderSvg(geometry, theme);
          expect(SyntaxValidator.validate(svg)).toBe(true);
          for (const text of textContents(svg)) expect(allowed).toContain(text);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('keeps label blocks in order and at least labelGap apart', () => {
    fc.assert(
      fc.property(configArbitrary, (config) => {
        const { stations } = layout(normalized(config));
        for (let i = 1; i < stations.length; i++) {
          const previous = stations[i - 1];
          const current = stations[i];
          if (!previous || !current) continue;
          expect(current.at.y).toBeGreaterThan(previous.at.y);
          expect(current.top - previous.bottom).toBeGreaterThanOrEqual(DEFAULT_METRICS.labelGap);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
