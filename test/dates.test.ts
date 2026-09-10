import { describe, expect, it } from 'vitest';
import { loadTimeline } from '../src/config/load.ts';
import { orderEvents } from '../src/layout/order.ts';
import { parseDate } from '../src/model/date.ts';
import { configWithLines, describeEvents, timelineOf } from './helpers.ts';

describe('parseDate', () => {
  it('reads a bare year as the whole year', () => {
    expect(parseDate(2020)).toEqual({ first: 2020 * 12, last: 2020 * 12 + 11 });
  });

  it('reads a month as just that month', () => {
    expect(parseDate('2020-06')).toEqual({ first: 2020 * 12 + 5, last: 2020 * 12 + 5 });
  });

  it.each(['2020-13', '2020-00', '2020-6', '20', '2020/06', 2020.5])('rejects %s', (input) => {
    expect(parseDate(input)).toBeUndefined();
  });
});

describe('config dates are periods', () => {
  it('lets a line ending in a year contain a station from a month of that year', () => {
    const result = loadTimeline(
      configWithLines(`
        - { id: phd, label: PhD, color: '#222222', stations: [{ title: PhD, from: 2016, to: 2020 }] }
        - { id: intern, label: I, color: '#333333', parent: phd, stations: [{ title: Intern, from: '2020-06' }] }
      `),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a station from a month to the end of that same year', () => {
    const result = loadTimeline(
      configWithLines(`
        - { id: a, label: A, color: '#222222', stations: [{ title: T, from: '2019-06', to: 2019 }] }
      `),
    );
    expect(result.ok).toBe(true);
  });

  it('reports a child that starts after its parent has ended', () => {
    const result = loadTimeline(
      configWithLines(`
        - { id: p, label: P, color: '#222222', stations: [{ title: P1, from: 2016, to: 2018 }] }
        - { id: c, label: C, color: '#333333', parent: p, stations: [{ title: C1, from: 2019 }] }
      `),
    );
    expect(result.ok ? [] : result.error.map((issue) => [issue.message, issue.path])).toEqual([
      ['starts after its parent line "p" has ended', ['lines', 1, 'stations', 0, 'from']],
    ]);
  });

  it('merges a degree ending in the year a PhD starts before the PhD branches', () => {
    const events = describeEvents(
      orderEvents(
        timelineOf(
          configWithLines(`
            - { id: ms, label: M, color: '#222222', stations: [{ title: MS, from: 2018, to: 2023 }] }
            - { id: phd, label: P, color: '#333333', ongoing: true, stations: [{ title: PhD, from: 2023 }] }
          `),
        ),
      ),
    );
    expect(events.indexOf('merge:ms')).toBeLessThan(events.indexOf('branch:phd'));
  });

  it('never starts a child before its parent, even when its year begins earlier', () => {
    const timeline = timelineOf(
      configWithLines(`
        - { id: p, label: P, color: '#222222', stations: [{ title: P1, from: '2020-06', to: 2022 }] }
        - { id: c, label: C, color: '#333333', parent: p, stations: [{ title: C1, from: 2020 }] }
      `),
    );
    const [, parent, child] = timeline.lines;
    expect(child?.start).toBe(parent?.start);
    const events = describeEvents(orderEvents(timeline));
    expect(events.indexOf('branch:p')).toBeLessThan(events.indexOf('branch:c'));
  });
});
