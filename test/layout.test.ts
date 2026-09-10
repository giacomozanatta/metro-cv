import { describe, expect, it } from 'vitest';
import { findCrossings } from '../src/layout/crossings.ts';
import { computeColumns, shapeStationLabel, type LabelShape } from '../src/layout/labels.ts';
import { assignLanes } from '../src/layout/lanes.ts';
import { layout } from '../src/layout/layout.ts';
import { DEFAULT_METRICS } from '../src/layout/metrics.ts';
import { orderEvents } from '../src/layout/order.ts';
import { placeVertically } from '../src/layout/vertical.ts';
import { configWithLines, describeEvents, readExample, timelineOf } from './helpers.ts';

const showcase = timelineOf(readExample('showcase'));

describe('orderEvents', () => {
  it('orders the showcase career', () => {
    expect(describeEvents(orderEvents(showcase))).toEqual([
      'branch:bs',
      'bs@B.S. Computer Science',
      // Same date: merges come before branches.
      'merge:bs',
      'branch:ms',
      'ms@M.S. Computer Science',
      'branch:acme',
      'acme@Software Consultant & Software Engineer',
      'acme@Technical Leader',
      // Same date: the line opened last closes first.
      'merge:acme',
      'merge:ms',
      'branch:phd',
      'phd@PhD in Computer Science',
      'branch:intern-1',
      'intern-1@Applied Scientist Intern',
      'merge:intern-1',
      'branch:intern-2',
      'intern-2@Applied Scientist Intern',
      'merge:intern-2',
    ]);
  });

  it('runs a zero-length child in its parent final year before the parent merges', () => {
    const timeline = timelineOf(
      configWithLines(`
        - { id: p, label: P, color: '#222222', stations: [{ title: P1, from: 2020, to: 2025 }] }
        - { id: c, label: C, color: '#333333', parent: p, stations: [{ title: C1, from: 2025 }] }
      `),
    );
    expect(describeEvents(orderEvents(timeline))).toEqual([
      'branch:p',
      'p@P1',
      'branch:c',
      'c@C1',
      'merge:c',
      'merge:p',
    ]);
  });

  it('opens the longer of two lines starting together first', () => {
    const timeline = timelineOf(
      configWithLines(`
        - { id: short, label: S, color: '#222222', stations: [{ title: S1, from: 2020, to: 2021 }] }
        - { id: long, label: L, color: '#333333', stations: [{ title: L1, from: 2020, to: 2024 }] }
      `),
    );
    const events = describeEvents(orderEvents(timeline));
    expect(events.indexOf('branch:long')).toBeLessThan(events.indexOf('branch:short'));
  });
});

describe('assignLanes', () => {
  it('nests the showcase career without crossings', () => {
    const events = orderEvents(showcase);
    const assignment = assignLanes(showcase, events);
    expect(Object.fromEntries(assignment.lanes)).toEqual({
      main: 0,
      bs: 1,
      ms: 2,
      acme: 1,
      phd: 1,
      'intern-1': 2,
      'intern-2': 2,
    });
    expect(assignment.laneCount).toBe(3);
    expect(findCrossings(events, assignment)).toEqual([]);
  });

  it('keeps two ongoing lines apart, the later one inside', () => {
    const timeline = timelineOf(
      configWithLines(`
        - { id: early, label: E, color: '#222222', ongoing: true, stations: [{ title: E1, from: 2015 }] }
        - { id: late, label: L, color: '#333333', ongoing: true, stations: [{ title: L1, from: 2020 }] }
      `),
    );
    const { lanes } = assignLanes(timeline, orderEvents(timeline));
    expect(lanes.get('late')).toBe(1);
    expect(lanes.get('early')).toBe(2);
  });

  it('reports the one unavoidable crossing between partially overlapping lines', () => {
    const timeline = timelineOf(readExample('crossing'));
    const events = orderEvents(timeline);
    expect(findCrossings(events, assignLanes(timeline, events))).toEqual([
      { eventIndex: 2, line: 'globex', under: 'msc', lane: 1 },
    ]);
  });
});

describe('placeVertically', () => {
  const events = orderEvents(showcase);
  const assignment = assignLanes(showcase, events);
  const columns = computeColumns(
    showcase.lines.flatMap((line) => line.stations),
    assignment.laneCount,
    DEFAULT_METRICS,
  );
  const shapes = new Map<number, LabelShape>();
  events.forEach((event, i) => {
    if (event.kind === 'station') {
      shapes.set(i, shapeStationLabel(event.station, columns, DEFAULT_METRICS));
    }
  });
  const { eventY } = placeVertically(events, assignment, shapes, undefined, DEFAULT_METRICS);
  const indexOf = (name: string) => describeEvents(events).indexOf(name);

  it('merges lines that end together as a parallel fan', () => {
    expect(eventY[indexOf('merge:acme')]).toBe(eventY[indexOf('merge:ms')]);
  });

  it('never moves upwards', () => {
    for (let i = 1; i < eventY.length; i++) {
      expect(eventY[i]).toBeGreaterThanOrEqual(eventY[i - 1] ?? -Infinity);
    }
  });
});

describe('layout', () => {
  it('shares one legend entry between lines that look the same', () => {
    expect(layout(showcase).legend.map((entry) => entry.label)).toEqual([
      'B.S.',
      'M.S.',
      'ACME Inc.',
      'PhD',
      'Internships',
    ]);
  });

  it('lists the main line in the legend only when it has a label', () => {
    const labelled = timelineOf(readExample('showcase').replace('main:\n', 'main:\n  label: Me\n'));
    expect(layout(labelled).legend[0]?.label).toBe('Me');
  });

  it('draws a dotted tail only on ongoing lines', () => {
    const tails = layout(showcase)
      .tracks.filter((track) => track.tail)
      .map((track) => track.line);
    expect(tails).toEqual(['main', 'phd']);
  });

  it('wraps tag chips to respect the maximum width', () => {
    const narrow = layout(showcase, { maxWidth: 520 });
    const chips = narrow.stations.flatMap((station) => station.label.chips);
    expect(Math.max(...chips.map((chip) => chip.x + chip.width))).toBeLessThanOrEqual(
      520 - DEFAULT_METRICS.margin,
    );
    const consultant = narrow.stations.find((station) => station.label.chips.length === 7);
    expect(new Set(consultant?.label.chips.map((chip) => chip.y)).size).toBeGreaterThan(1);
  });
});
