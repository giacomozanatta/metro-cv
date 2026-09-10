import fc from 'fast-check';
import type { Config, LineConfig, StationConfig } from '../src/config/schema.ts';

// Random but always valid careers. Lines are generated parents first, with every date inside its
// parent's months, so the config stays valid however each date is written: a bare year only
// widens a date to the whole year, and validation only rejects what is certainly wrong.

const FIRST_MONTH = 2000 * 12;
const LAST_MONTH = 2030 * 12;
const COLORS = ['#1e3a8a', '#d6457e', '#00a650', '#e32017', '#7b3f98', '#ff9900', '#0e7490'];

const stationSpec = fc.record({
  pick: fc.nat({ max: 1000 }),
  length: fc.option(fc.nat({ max: 1000 }), { nil: undefined }),
  period: fc.boolean(),
  longTitle: fc.boolean(),
});

const lineSpec = fc.record({
  parent: fc.nat(),
  offset: fc.nat({ max: 240 }),
  length: fc.nat({ max: 240 }),
  ongoing: fc.boolean(),
  bareYears: fc.boolean(),
  sharedStyle: fc.boolean(),
  upperCase: fc.boolean(),
  extraStations: fc.array(stationSpec, { maxLength: 3 }),
  tags: fc.nat({ max: 9 }),
  subtitle: fc.boolean(),
});

type LineSpec = typeof lineSpec extends fc.Arbitrary<infer T> ? T : never;
type StationSpec = typeof stationSpec extends fc.Arbitrary<infer T> ? T : never;

export const configArbitrary: fc.Arbitrary<Config> = fc
  .tuple(fc.array(lineSpec, { minLength: 1, maxLength: 12 }), fc.nat())
  .map(([specs, rotation]) => buildConfig(specs, rotation));

function buildConfig(specs: readonly LineSpec[], rotation: number): Config {
  const spans: { start: number; end: number; ongoing: boolean }[] = [];
  const lines = specs.map((spec, i): LineConfig => {
    // Parent 0 is the main line; parent k > 0 is line k - 1.
    const parentIndex = spec.parent % (i + 1);
    const parent =
      parentIndex === 0
        ? { start: FIRST_MONTH, end: LAST_MONTH, ongoing: true }
        : spans[parentIndex - 1];
    if (!parent) throw new Error('parent span missing');

    const start = parent.start + (spec.offset % (parent.end - parent.start + 1));
    const end = parent.ongoing ? start + spec.length : Math.min(start + spec.length, parent.end);
    const ongoing = spec.ongoing && parent.ongoing;
    spans.push({ start, end, ongoing });

    const write = (month: number) => (spec.bareYears ? Math.floor(month / 12) : formatMonth(month));
    const extra = spec.extraStations.map((station, j) => {
      const from = start + (station.pick % (end - start + 1));
      const to =
        station.length === undefined ? undefined : from + (station.length % (end - from + 1));
      return makeStation(
        `Station ${i}.${j + 1}`,
        write(from),
        to === undefined ? undefined : write(to),
        spec,
        station,
      );
    });
    const color = spec.sharedStyle ? '#abcdef' : (COLORS[i % COLORS.length] ?? '#000000');
    return {
      id: `line-${i}`,
      label: spec.sharedStyle ? 'Shared' : `Line ${i}`,
      color: spec.upperCase ? color.toUpperCase() : color,
      ...(parentIndex > 0 && { parent: `line-${parentIndex - 1}` }),
      ...(ongoing && { ongoing }),
      stations: [makeStation(`Station ${i}.0`, write(start), write(end), spec), ...extra],
    };
  });

  // Rotate the config order so parents are sometimes declared after their children.
  const cut = rotation % lines.length;
  return {
    version: 1,
    main: { label: 'Me', color: '#334155', origin: 'Origin' },
    lines: [...lines.slice(cut), ...lines.slice(0, cut)],
  };
}

function makeStation(
  title: string,
  from: number | string,
  to: number | string | undefined,
  line: LineSpec,
  station?: StationSpec,
): StationConfig {
  const fullTitle = station?.longTitle
    ? `${title}, with a title long enough to push the map past its usual width`
    : title;
  return {
    title: fullTitle,
    from,
    ...(to !== undefined && { to }),
    ...(station?.period && { period: `Period of ${title}` }),
    org: `Org of ${title}`,
    ...(line.subtitle
      ? { subtitle: `Subtitle of ${title}` }
      : line.tags > 0 && { tags: Array.from({ length: line.tags }, (_, k) => `tag-${k}`) }),
  };
}

function formatMonth(month: number): string {
  return `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`;
}
