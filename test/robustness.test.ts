import { describe, expect, it } from 'vitest';
import { loadTimeline } from '../src/config/load.ts';
import { findCrossings } from '../src/layout/crossings.ts';
import { assignLanes } from '../src/layout/lanes.ts';
import { layout } from '../src/layout/layout.ts';
import type { LayoutMetrics } from '../src/layout/metrics.ts';
import { orderEvents } from '../src/layout/order.ts';
import { roundedPath } from '../src/render/svg.ts';
import { configWithLines, readExample, timelineOf } from './helpers.ts';

describe('lane packing', () => {
  it('keeps a family nested in time inside the line that contains it', () => {
    // A part-time degree during an ongoing job, with an internship during the degree.
    const timeline = timelineOf(
      configWithLines(`
        - { id: job, label: Job, color: '#222222', ongoing: true, stations: [{ title: Engineer, from: 2015 }] }
        - { id: ms, label: M.S., color: '#333333', stations: [{ title: M.S., from: 2018, to: 2020 }] }
        - { id: intern, label: Intern, color: '#444444', parent: ms, stations: [{ title: Internship, from: 2019 }] }
      `),
    );
    const events = orderEvents(timeline);
    const assignment = assignLanes(timeline, events);
    expect(Object.fromEntries(assignment.lanes)).toEqual({ main: 0, ms: 1, intern: 2, job: 3 });
    expect(findCrossings(events, assignment)).toEqual([]);
  });

  it('keeps an enclosing line outside a nested one that was pushed outwards', () => {
    // Found by property testing: `l1` lies inside `l4` in time, but its child cannot share a lane
    // with the `l3` family, so `l1` is pushed outwards; `l4` must then not take the inner lane.
    const timeline = timelineOf(
      configWithLines(`
        - { id: l2, label: L2, color: '#222222', stations: [{ title: S2, from: '2000-01', to: '2000-01' }] }
        - { id: l3, label: L3, color: '#333333', stations: [{ title: S3, from: '2000-01', to: '2000-02' }] }
        - { id: l4, label: L4, color: '#444444', ongoing: true, stations: [{ title: S4, from: '2000-02' }] }
        - { id: l5, label: L5, color: '#555555', parent: l3, stations: [{ title: S5, from: '2000-02' }] }
        - { id: l6, label: L6, color: '#666666', parent: l1, stations: [{ title: S6, from: '2000-02', to: '2000-03' }] }
        - { id: l0, label: L0, color: '#777777', stations: [{ title: S0, from: '2000-01', to: '2000-01' }] }
        - { id: l1, label: L1, color: '#888888', ongoing: true, stations: [{ title: S1, from: '2000-02' }] }
      `),
    );
    const events = orderEvents(timeline);
    const assignment = assignLanes(timeline, events);
    const nestedPairs = findCrossings(events, assignment).filter(({ line, under }) => {
      const a = assignment.spanOf(line);
      const b = assignment.spanOf(under);
      return (a.start <= b.start && b.end <= a.end) || (b.start <= a.start && a.end <= b.end);
    });
    expect(nestedPairs).toEqual([]);
    expect(assignment.laneOf('l4')).toBeGreaterThan(assignment.laneOf('l1'));
  });
});

describe('text that cannot go into XML', () => {
  it('is rejected with its position', () => {
    const result = loadTimeline(
      configWithLines(`
        - { id: a, label: A, color: '#222222', stations: [{ title: "bad\\x01title", from: 2020 }] }
      `),
    );
    if (result.ok) throw new Error('expected the config to be rejected');
    expect(result.error.map((issue) => [issue.message, issue.path])).toEqual([
      ['must not contain control characters', ['lines', 0, 'stations', 0, 'title']],
    ]);
  });
});

describe('colours', () => {
  it('share a legend entry regardless of hex letter case', () => {
    const timeline = timelineOf(
      configWithLines(`
        - { id: a, label: AWS, color: '#FF9900', stations: [{ title: A, from: 2020 }] }
        - { id: b, label: AWS, color: '#ff9900', stations: [{ title: B, from: 2022 }] }
      `),
    );
    expect(layout(timeline).legend.map((entry) => entry.label)).toEqual(['Me', 'AWS']);
  });
});

describe('layout options', () => {
  const timeline = timelineOf(readExample('minimal'));

  it('rejects metrics that cannot produce a drawing', () => {
    expect(() => layout(timeline, { laneSpacing: 0 })).toThrow(RangeError);
    expect(() => layout(timeline, { margin: -1 })).toThrow(RangeError);
    expect(() => layout(timeline, { maxWidth: Number.NaN })).toThrow(RangeError);
  });

  it('treats an explicit undefined like a missing option', () => {
    const options = { laneSpacing: undefined } as unknown as Partial<LayoutMetrics>;
    expect(layout(timeline, options)).toEqual(layout(timeline));
  });
});

describe('roundedPath', () => {
  it('ignores repeated points instead of producing NaN', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 20, y: 20 },
      ],
      10,
    );
    expect(d).toBe('M0,0 L0,10 Q0,20 10,20 L20,20');
  });
});
