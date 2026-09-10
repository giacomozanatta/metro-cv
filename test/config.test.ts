import { describe, expect, it } from 'vitest';
import { formatIssue, type ConfigIssue } from '../src/config/issues.ts';
import { loadTimeline } from '../src/config/load.ts';
import { MAIN_LINE_ID } from '../src/model/timeline.ts';
import { configWithLines, readExample, timelineOf } from './helpers.ts';

function issuesOf(source: string): readonly ConfigIssue[] {
  const result = loadTimeline(source);
  if (result.ok) throw new Error('expected the config to be rejected');
  return result.error;
}

function onlyIssue(source: string): ConfigIssue {
  const issues = issuesOf(source);
  expect(issues).toHaveLength(1);
  const [issue] = issues;
  if (!issue) throw new Error('unreachable');
  return issue;
}

describe('loading a valid config', () => {
  it('puts the main line first and keeps config order after it', () => {
    const timeline = timelineOf(readExample('giacomo'));
    expect(timeline.lines.map((line) => line.id)).toEqual([
      MAIN_LINE_ID,
      'bs',
      'ms',
      'alpenite',
      'phd',
      'aws-nyc',
      'aws-austin',
    ]);
    expect(timeline.origin).toBe('Giacomo Zanatta');
    expect(timeline.lines[0]?.parent).toBeNull();
    expect(timeline.lines.find((line) => line.id === 'aws-nyc')?.depth).toBe(2);
  });

  it('shows periods exactly as the user wrote their dates', () => {
    const timeline = timelineOf(
      configWithLines(`
        - id: a
          label: A
          color: '#222222'
          stations:
            - { title: Range, from: 2015, to: 2018 }
            - { title: Single, from: 2019 }
            - { title: Same year, from: 2020, to: 2020 }
            - { title: Months, from: '2021-03', to: '2021-09' }
            - { title: Custom, from: 2022, period: since 2022 }
      `),
    );
    expect(timeline.lines[1]?.stations.map((s) => s.period)).toEqual([
      '2015–2018',
      '2019',
      '2020',
      '2021-03–2021-09',
      'since 2022',
    ]);
  });

  it('sorts stations by date, keeping config order for ties', () => {
    const timeline = timelineOf(
      configWithLines(`
        - id: a
          label: A
          color: '#222222'
          stations:
            - { title: Later, from: 2020 }
            - { title: First tie, from: 2018 }
            - { title: Second tie, from: 2018 }
      `),
    );
    expect(timeline.lines[1]?.stations.map((s) => s.title)).toEqual([
      'First tie',
      'Second tie',
      'Later',
    ]);
  });
});

describe('rejecting an invalid config', () => {
  it('reports YAML errors with their position', () => {
    const issue = onlyIssue('version: 1\nversion: 1\n');
    expect(issue.position).toEqual({ line: 2, column: 1 });
  });

  it('points a missing field at the object that lacks it', () => {
    const issue = onlyIssue(
      configWithLines(`
        - id: a
          label: A
          color: '#222222'
          stations:
            - from: 2020
      `),
    );
    expect(issue.path).toEqual(['lines', 0, 'stations', 0, 'title']);
    expect(issue.position).toEqual({ line: 8, column: 7 });
  });

  it.each([
    ['color', "color: 'blue'", 'expected a hex colour like "#1e3a8a"', ['lines', 0, 'color']],
    ['id', 'id: Not A Slug', 'expected a lowercase id like "aws-nyc"', ['lines', 0, 'id']],
  ])('explains a malformed %s', (_, field, message, path) => {
    const source = configWithLines(`
      - id: a
        label: A
        color: '#222222'
        stations: [{ title: T, from: 2020 }]
    `).replace(field.startsWith('color') ? "color: '#222222'" : 'id: a', field);
    const issue = onlyIssue(source);
    expect(issue.message).toBe(message);
    expect(issue.path).toEqual(path);
  });

  it('rejects impossible dates', () => {
    const issue = onlyIssue(
      configWithLines(`
        - id: a
          label: A
          color: '#222222'
          stations: [{ title: T, from: '2019-13' }]
      `),
    );
    expect(issue.message).toBe('expected a year like 2019 or a month like "2019-03"');
    expect(issue.path).toEqual(['lines', 0, 'stations', 0, 'from']);
  });

  it('rejects a station with both a subtitle and tags', () => {
    const issue = onlyIssue(
      configWithLines(`
        - id: a
          label: A
          color: '#222222'
          stations: [{ title: T, from: 2020, subtitle: S, tags: [x] }]
      `),
    );
    expect(issue.path).toEqual(['lines', 0, 'stations', 0, 'tags']);
  });

  it('rejects unknown keys, which are usually typos', () => {
    const issue = onlyIssue(
      configWithLines(`
        - id: a
          label: A
          colour: '#222222'
          color: '#222222'
          stations: [{ title: T, from: 2020 }]
      `),
    );
    expect(issue.message).toContain('colour');
  });

  it.each([
    [
      'a duplicate id',
      `
        - { id: a, label: A, color: '#222222', stations: [{ title: T, from: 2020 }] }
        - { id: a, label: B, color: '#333333', stations: [{ title: T, from: 2021 }] }
      `,
      'duplicate line id "a"',
      ['lines', 1, 'id'],
    ],
    [
      'the reserved main id',
      `
        - { id: main, label: A, color: '#222222', stations: [{ title: T, from: 2020 }] }
      `,
      '"main" is reserved for the main line',
      ['lines', 0, 'id'],
    ],
    [
      'an unknown parent',
      `
        - { id: a, label: A, color: '#222222', parent: nope, stations: [{ title: T, from: 2020 }] }
      `,
      'unknown parent line "nope"',
      ['lines', 0, 'parent'],
    ],
    [
      'a station ending before it starts',
      `
        - { id: a, label: A, color: '#222222', stations: [{ title: T, from: 2020, to: 2019 }] }
      `,
      '"to" is earlier than "from"',
      ['lines', 0, 'stations', 0, 'to'],
    ],
    [
      'a child starting before its parent',
      `
        - { id: p, label: P, color: '#222222', stations: [{ title: T, from: 2020, to: 2024 }] }
        - { id: c, label: C, color: '#333333', parent: p, stations: [{ title: T, from: 2019 }] }
      `,
      'starts before its parent line "p"',
      ['lines', 1, 'stations', 0, 'from'],
    ],
    [
      'a child ending after its parent',
      `
        - { id: p, label: P, color: '#222222', stations: [{ title: T, from: 2020, to: 2024 }] }
        - { id: c, label: C, color: '#333333', parent: p, stations: [{ title: T, from: 2021, to: 2025 }] }
      `,
      'ends after its parent line "p"',
      ['lines', 1, 'stations', 0, 'to'],
    ],
    [
      'an ongoing child of a line that ends',
      `
        - { id: p, label: P, color: '#222222', stations: [{ title: T, from: 2020, to: 2024 }] }
        - { id: c, label: C, color: '#333333', parent: p, ongoing: true, stations: [{ title: T, from: 2021 }] }
      `,
      'cannot be ongoing inside "p", which is not ongoing',
      ['lines', 1, 'ongoing'],
    ],
  ])('rejects %s', (_, lines, message, path) => {
    const issue = onlyIssue(configWithLines(lines));
    expect(issue.message).toBe(message);
    expect(issue.path).toEqual(path);
    expect(issue.position).toBeDefined();
  });

  it('reports a parent loop once for each line on it', () => {
    const issues = issuesOf(
      configWithLines(`
        - { id: a, label: A, color: '#222222', parent: b, stations: [{ title: T, from: 2020 }] }
        - { id: b, label: B, color: '#333333', parent: a, stations: [{ title: T, from: 2020 }] }
        - { id: c, label: C, color: '#444444', parent: a, stations: [{ title: T, from: 2020 }] }
      `),
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      'parent lines form a loop: a → b → a',
      'parent lines form a loop: b → a → b',
    ]);
  });
});

describe('formatIssue', () => {
  it('formats like a compiler diagnostic', () => {
    const issue: ConfigIssue = {
      path: ['lines', 2, 'stations', 0, 'to'],
      message: '"to" is earlier than "from"',
      position: { line: 14, column: 13 },
    };
    expect(formatIssue(issue, 'metro-cv.yml')).toBe(
      'metro-cv.yml:14:13: "to" is earlier than "from" (at lines[2].stations[0].to)',
    );
  });

  it('omits what it does not know', () => {
    expect(formatIssue({ path: [], message: 'broken' }, 'metro-cv.yml')).toBe(
      'metro-cv.yml: broken',
    );
  });
});
