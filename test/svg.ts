import type { Config } from '../src/config/schema.ts';

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/** Unescaped contents of every `<text>` and `<title>` element. */
export function textContents(svg: string): string[] {
  return [...svg.matchAll(/<(text|title)\b[^>]*>([^<]*)<\/\1>/g)].map(([, , content = '']) =>
    content.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity),
  );
}

/**
 * Every string a config puts in the user's hands: its text fields verbatim, and, for stations
 * without a `period`, their dates as written, alone or joined by a dash.
 */
export function userStrings(config: Config): Set<string> {
  const strings = new Set<string>([config.main.label]);
  if (config.title !== undefined) strings.add(config.title);
  if (config.main.origin !== undefined) strings.add(config.main.origin);
  for (const line of config.lines) {
    strings.add(line.label);
    for (const station of line.stations) {
      const from = String(station.from);
      const to = station.to === undefined ? undefined : String(station.to);
      const dates = to === undefined ? [from] : [from, `${from}–${to}`];
      for (const value of [
        station.title,
        station.org,
        station.subtitle,
        ...(station.tags ?? []),
        ...(station.period === undefined ? dates : [station.period]),
      ]) {
        if (value !== undefined) strings.add(value);
      }
    }
  }
  return strings;
}
