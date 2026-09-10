import { describe, expect, it } from 'vitest';
import { layout, type Layout } from '../src/layout/layout.ts';
import { readExample, timelineOf } from './helpers.ts';

const source = readExample('showcase').replace('main:\n', 'main:\n  origin: Where it started\n');
const normal = layout(timelineOf(source));
const reversed = layout(timelineOf(source.replace('version: 1', 'version: 1\nreversed: true')));

const titles = (map: Layout) => map.stations.map((station) => station.label.title.text);

describe('a reversed map', () => {
  it('shows the same stations, newest first', () => {
    expect(titles(reversed)).toEqual(titles(normal).toReversed());
  });

  it('keeps every station on the same lane', () => {
    const lanes = (map: Layout) =>
      Object.fromEntries(map.stations.map((station) => [station.label.title.text, station.at.x]));
    expect(lanes(reversed)).toEqual(lanes(normal));
  });

  it('fades the main line and ongoing lines out upwards', () => {
    const tails = reversed.tracks.flatMap(({ line, tail }) =>
      tail ? [[line, Math.sign(tail.to.y - tail.from.y)]] : [],
    );
    expect(tails).toEqual([
      ['main', -1],
      ['phd', -1],
    ]);
  });

  it('ends the main line at the origin, at the bottom', () => {
    const origin = reversed.stations.at(-1);
    expect(origin?.kind).toBe('origin');
    expect(reversed.tracks[0]?.points.at(-1)?.y).toBe(origin?.at.y);
  });

  it('starts ongoing lines at the top of the map', () => {
    const tops = reversed.tracks.flatMap((track) => (track.points[0] ? [track.points[0].y] : []));
    const phd = reversed.tracks.find((track) => track.line === 'phd');
    expect(phd?.points[0]?.y).toBe(Math.min(...tops));
  });
});
