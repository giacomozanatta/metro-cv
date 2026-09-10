import { describe, expect, it } from 'vitest';
import { findCrossings } from '../src/layout/crossings.ts';
import { computeColumns, shapeStationLabel, type LabelShape } from '../src/layout/labels.ts';
import { assignLanes } from '../src/layout/lanes.ts';
import { layout } from '../src/layout/layout.ts';
import { DEFAULT_METRICS } from '../src/layout/metrics.ts';
import { orderEvents } from '../src/layout/order.ts';
import { placeVertically } from '../src/layout/vertical.ts';
import { configWithLines, describeEvents, readExample, timelineOf } from './helpers.ts';

const giacomo = timelineOf(readExample('giacomo'));

describe('orderEvents', () => {
  it('orders the reference career', () => {
    expect(describeEvents(orderEvents(giacomo))).toEqual([
      'branch:bs',
      'bs@B.S. Information Science and Technology',
      'merge:bs',
      'branch:ms',
      'ms@M.S. Computer Science',
      'branch:alpenite',
      'alpenite@Software Consultant & Software Engineer',
      'alpenite@Technical Leader',
      // Same date: the line opened last closes first, and merges come before branches.
      'merge:alpenite',
      'merge:ms',
      'branch:phd',
      'phd@PhD in Computer Science',
      'branch:aws-nyc',
      'aws-nyc@Applied Scientist Intern',
      'merge:aws-nyc',
      'branch:aws-austin',
      'aws-austin@Applied Scientist Intern',
      'merge:aws-austin',
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
  it('nests the reference career without crossings', () => {
    const events = orderEvents(giacomo);
    const assignment = assignLanes(giacomo, events);
    expect(Object.fromEntries(assignment.lanes)).toEqual({
      main: 0,
      bs: 1,
      ms: 2,
      alpenite: 1,
      phd: 1,
      'aws-nyc': 2,
      'aws-austin': 2,
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
  const events = orderEvents(giacomo);
  const assignment = assignLanes(giacomo, events);
  const columns = computeColumns(
    giacomo.lines.flatMap((line) => line.stations),
    assignment.laneCount,
    DEFAULT_METRICS,
  );
  const shapes = new Map<number, LabelShape>();
  events.forEach((event, i) => {
    if (event.kind === 'station')
      shapes.set(i, shapeStationLabel(event.station, columns, DEFAULT_METRICS));
  });
  const { eventY } = placeVertically(events, assignment, shapes, undefined, DEFAULT_METRICS);
  const indexOf = (name: string) => describeEvents(events).indexOf(name);

  it('merges lines that end together as a parallel fan', () => {
    expect(eventY[indexOf('merge:alpenite')]).toBe(eventY[indexOf('merge:ms')]);
  });

  it('never moves upwards', () => {
    for (let i = 1; i < eventY.length; i++) {
      expect(eventY[i]).toBeGreaterThanOrEqual(eventY[i - 1] ?? -Infinity);
    }
  });
});

describe('layout', () => {
  it('shares one legend entry between lines that look the same', () => {
    expect(layout(giacomo).legend.map((entry) => entry.label)).toEqual([
      'Giacomo',
      'B.S.',
      'M.S.',
      'Alpenite',
      'PhD',
      'AWS',
    ]);
  });

  it('draws a dotted tail only on ongoing lines', () => {
    const tails = layout(giacomo)
      .tracks.filter((track) => track.tail)
      .map((track) => track.line);
    expect(tails).toEqual(['main', 'phd']);
  });

  it('wraps tag chips to respect the maximum width', () => {
    const narrow = layout(giacomo, { maxWidth: 520 });
    const chips = narrow.stations.flatMap((station) => station.label.chips);
    expect(Math.max(...chips.map((chip) => chip.x + chip.width))).toBeLessThanOrEqual(
      520 - DEFAULT_METRICS.margin,
    );
    expect(
      new Set(chips.filter((c) => c.text === 'Jira' || c.text === 'Node.js').map((c) => c.y)).size,
    ).toBe(2);
  });
});
