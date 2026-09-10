import { readdirSync, readFileSync } from 'node:fs';
import { loadTimeline } from '../src/config/load.ts';
import type { LayoutEvent } from '../src/layout/order.ts';
import type { Timeline } from '../src/model/timeline.ts';

const EXAMPLES = new URL('../examples/', import.meta.url);

export const exampleNames: readonly string[] = readdirSync(EXAMPLES)
  .filter((file) => file.endsWith('.yml'))
  .map((file) => file.slice(0, -'.yml'.length))
  .sort();

export function readExample(name: string): string {
  return readFileSync(new URL(`${name}.yml`, EXAMPLES), 'utf8');
}

/** Loads a config that the test expects to be valid. */
export function timelineOf(source: string): Timeline {
  const result = loadTimeline(source);
  if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join('\n'));
  return result.value;
}

/** A complete config whose `lines:` section is the given YAML (written at column 0). */
export function configWithLines(lines: string): string {
  return `version: 1\nmain: { label: Me, color: '#111111' }\nlines:\n${dedent(lines)}`;
}

/** Strips the indentation shared by all non-blank lines, so YAML can be indented in tests. */
export function dedent(text: string): string {
  const lines = text.replace(/^\n/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const indent = Math.min(...indents);
  return lines.map((line) => line.slice(indent)).join('\n');
}

/** Short readable names for events: `branch:phd`, `phd@PhD in Computer Science`, `merge:phd`. */
export function describeEvents(events: readonly LayoutEvent[]): string[] {
  return events.map((event) =>
    event.kind === 'station'
      ? `${event.line.id}@${event.station.title}`
      : `${event.kind}:${event.line.id}`,
  );
}
