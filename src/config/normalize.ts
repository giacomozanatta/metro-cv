import { parseDate, type DatePeriod, type YearMonth } from '../model/date.ts';
import { MAIN_LINE_ID, type Line, type Station, type Timeline } from '../model/timeline.ts';
import { err, ok, type Result } from '../result.ts';
import type { ConfigIssue } from './issues.ts';
import type { Config, LineConfig, StationConfig } from './schema.ts';

/** A line's stations with their dates, remembering config indices for error messages. */
interface ResolvedLine {
  /** Sorted by the first month of `from`; stations sharing it keep their config order. */
  readonly stations: readonly {
    readonly config: StationConfig;
    readonly from: DatePeriod;
    readonly index: number;
  }[];
  /** The earliest `from`. */
  readonly start: DatePeriod;
  /** The latest `to`, or `from` for stations without one. */
  readonly end: DatePeriod;
  readonly firstIndex: number;
  readonly lastIndex: number;
}

type ParentOf = (lineIndex: number) => number | undefined;

/**
 * Checks the rules the schema cannot express (unique ids, known and acyclic parents, lines nested
 * inside their parent's lifetime) and resolves the config into a {@link Timeline}.
 *
 * Config dates are periods: a bare year covers the whole year. A rule is only reported as broken
 * when it certainly is, so a line ending in 2020 may contain an internship from 2020-06.
 */
export function normalize(config: Config): Result<Timeline, readonly ConfigIssue[]> {
  const issues: ConfigIssue[] = [];
  const indexById = indexLineIds(config.lines, issues);
  checkParentsExist(config.lines, indexById, issues);
  if (issues.length > 0) return err(issues);

  const parentOf: ParentOf = (i) => {
    const parent = config.lines[i]?.parent;
    return parent === undefined ? undefined : indexById.get(parent);
  };
  const depths = computeDepths(config.lines, parentOf, issues);
  const resolved = config.lines.map((line, i) => resolveLine(line, i, issues));
  if (
    issues.length > 0 ||
    depths === undefined ||
    !resolved.every((line): line is ResolvedLine => line !== undefined)
  ) {
    return err(issues);
  }

  config.lines.forEach((line, i) => {
    const p = parentOf(i);
    if (p === undefined) return;
    checkNesting(
      { line, index: i, resolved: required(resolved[i]) },
      { line: required(config.lines[p]), resolved: required(resolved[p]) },
      issues,
    );
  });
  if (issues.length > 0) return err(issues);

  const { starts, ends } = orderingDates(resolved, parentOf, depths);
  const lines = config.lines.map((line, i): Line => {
    const start = required(starts[i]);
    return {
      id: line.id,
      label: line.label,
      color: line.color.toLowerCase(),
      ...(line.darkColor !== undefined && { darkColor: line.darkColor.toLowerCase() }),
      parent: line.parent ?? MAIN_LINE_ID,
      depth: required(depths[i]),
      start,
      end: required(ends[i]),
      ongoing: line.ongoing ?? false,
      stations: required(resolved[i]).stations.map(({ config: station, from }) =>
        toStation(station, later(from.first, start)),
      ),
      order: i,
    };
  });

  const main: Line = {
    id: MAIN_LINE_ID,
    ...(config.main.label !== undefined && { label: config.main.label }),
    color: config.main.color.toLowerCase(),
    ...(config.main.darkColor !== undefined && {
      darkColor: config.main.darkColor.toLowerCase(),
    }),
    parent: null,
    depth: 0,
    start: lines.map((l) => l.start).reduce(earlier),
    end: lines.map((l) => l.end).reduce(later),
    ongoing: true,
    stations: [],
    order: -1,
  };

  return ok({
    ...(config.title !== undefined && { title: config.title }),
    reversed: config.reversed ?? false,
    ...(config.main.origin !== undefined && { origin: config.main.origin }),
    lines: [main, ...lines],
  });
}

function indexLineIds(lines: readonly LineConfig[], issues: ConfigIssue[]): Map<string, number> {
  const indexById = new Map<string, number>();
  lines.forEach((line, i) => {
    const path = ['lines', i, 'id'];
    if (line.id === MAIN_LINE_ID) {
      issues.push({ path, message: `"${MAIN_LINE_ID}" is reserved for the main line` });
    } else if (indexById.has(line.id)) {
      issues.push({ path, message: `duplicate line id "${line.id}"` });
    } else {
      indexById.set(line.id, i);
    }
  });
  return indexById;
}

function checkParentsExist(
  lines: readonly LineConfig[],
  indexById: ReadonlyMap<string, number>,
  issues: ConfigIssue[],
): void {
  lines.forEach((line, i) => {
    if (line.parent !== undefined && line.parent !== MAIN_LINE_ID && !indexById.has(line.parent)) {
      issues.push({
        path: ['lines', i, 'parent'],
        message: `unknown parent line "${line.parent}"`,
      });
    }
  });
}

/** Depth of every line in the parent tree, or `undefined` if some parent chain loops. */
function computeDepths(
  lines: readonly LineConfig[],
  parentOf: ParentOf,
  issues: ConfigIssue[],
): readonly number[] | undefined {
  const depths = lines.map((_, i): number | undefined => {
    const chain = [i];
    for (let p = parentOf(i); p !== undefined; p = parentOf(p)) {
      if (chain.includes(p)) {
        // Report the loop once per line on it; lines merely leading into it stay quiet.
        if (p === i) {
          const ids = [...chain, i].map((j) => lines[j]?.id).join(' → ');
          issues.push({
            path: ['lines', i, 'parent'],
            message: `parent lines form a loop: ${ids}`,
          });
        }
        return undefined;
      }
      chain.push(p);
    }
    return chain.length;
  });
  return depths.every((depth): depth is number => depth !== undefined) ? depths : undefined;
}

function resolveLine(
  line: LineConfig,
  lineIndex: number,
  issues: ConfigIssue[],
): ResolvedLine | undefined {
  const entries = line.stations.map((config, index) => ({
    config,
    index,
    from: toPeriod(config.from),
    to: config.to === undefined ? undefined : toPeriod(config.to),
  }));

  const reversed = entries.filter(({ from, to }) => to !== undefined && to.last < from.first);
  for (const { index } of reversed) {
    issues.push({
      path: ['lines', lineIndex, 'stations', index, 'to'],
      message: '"to" is earlier than "from"',
    });
  }
  if (reversed.length > 0) return undefined;

  const endOf = (entry: (typeof entries)[number]) => entry.to ?? entry.from;
  const first = entries.reduce((a, b) => (b.from.first < a.from.first ? b : a));
  const last = entries.reduce((a, b) => (endOf(b).first >= endOf(a).first ? b : a));

  return {
    stations: entries.toSorted((a, b) => a.from.first - b.from.first),
    start: first.from,
    end: endOf(last),
    firstIndex: first.index,
    lastIndex: last.index,
  };
}

interface NestingSide {
  readonly line: LineConfig;
  readonly resolved: ResolvedLine;
}

/** A line must live within its parent: it cannot start before it, end after it, or outlive it. */
function checkNesting(
  child: NestingSide & { readonly index: number },
  parent: NestingSide,
  issues: ConfigIssue[],
): void {
  const stationPath = (stationIndex: number, field: string) => [
    'lines',
    child.index,
    'stations',
    stationIndex,
    field,
  ];
  const parentId = parent.line.id;

  if (child.resolved.start.last < parent.resolved.start.first) {
    issues.push({
      path: stationPath(child.resolved.firstIndex, 'from'),
      message: `starts before its parent line "${parentId}"`,
    });
  }
  if (parent.line.ongoing === true) return;

  if (child.line.ongoing === true) {
    issues.push({
      path: ['lines', child.index, 'ongoing'],
      message: `cannot be ongoing inside "${parentId}", which is not ongoing`,
    });
  } else if (child.resolved.start.first > parent.resolved.end.last) {
    issues.push({
      path: stationPath(child.resolved.firstIndex, 'from'),
      message: `starts after its parent line "${parentId}" has ended`,
    });
  } else if (child.resolved.end.first > parent.resolved.end.last) {
    const last = child.line.stations[child.resolved.lastIndex];
    issues.push({
      path: stationPath(child.resolved.lastIndex, last?.to === undefined ? 'from' : 'to'),
      message: `ends after its parent line "${parentId}"`,
    });
  }
}

/**
 * One month for each line's start and end, used to order what happens on the map. It is the first
 * month of the config date, adjusted to the line tree: a child never starts before its parent, and
 * a line never ends before its own stations or its children. With bare years this matters: an
 * M.S. from 2018 to 2023 ends in January 2023, the month a PhD from 2023 starts, so the M.S.
 * merges back before the PhD branches off.
 */
function orderingDates(
  resolved: readonly ResolvedLine[],
  parentOf: ParentOf,
  depths: readonly number[],
): { starts: readonly YearMonth[]; ends: readonly YearMonth[] } {
  const parentsFirst = resolved
    .map((_, i) => i)
    .toSorted((a, b) => required(depths[a]) - required(depths[b]));

  const starts: YearMonth[] = [];
  for (const i of parentsFirst) {
    const own = required(resolved[i]).start.first;
    const p = parentOf(i);
    starts[i] = p === undefined ? own : later(own, required(starts[p]));
  }

  const ends: YearMonth[] = [];
  for (const i of parentsFirst.toReversed()) {
    const line = required(resolved[i]);
    const start = required(starts[i]);
    // Children come before their parent in this loop and have already raised ends[i].
    let end = later(ends[i] ?? start, later(line.end.first, start));
    for (const { from } of line.stations) end = later(end, from.first);
    ends[i] = end;
    const p = parentOf(i);
    if (p !== undefined) ends[p] = ends[p] === undefined ? end : later(ends[p], end);
  }

  return { starts, ends };
}

function toStation(config: StationConfig, from: YearMonth): Station {
  const fromText = String(config.from);
  const toText = config.to === undefined ? undefined : String(config.to);
  const period =
    config.period ??
    (toText === undefined || toText === fromText ? fromText : `${fromText}–${toText}`);
  return {
    title: config.title,
    period,
    ...(config.org !== undefined && { org: config.org }),
    ...(config.subtitle !== undefined && { subtitle: config.subtitle }),
    tags: config.tags ?? [],
    from,
  };
}

function toPeriod(value: number | string): DatePeriod {
  const period = parseDate(value);
  // The schema has already rejected malformed dates.
  if (period === undefined) throw new Error(`invalid date ${String(value)}`);
  return period;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('normalize: missing value for a validated line');
  return value;
}

function earlier(a: YearMonth, b: YearMonth): YearMonth {
  return b < a ? b : a;
}

function later(a: YearMonth, b: YearMonth): YearMonth {
  return b > a ? b : a;
}
