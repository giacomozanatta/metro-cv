import { z } from 'zod';
import { DATE_PATTERN } from '../model/date.ts';

// The schema describes shape only; rules across fields (parents, date ranges) live in
// normalize.ts.

/** The `Char` production of XML 1.0: anything else would make the whole SVG unreadable. */
function isXmlCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function isXmlText(value: string): boolean {
  // for…of walks code points, which is the unit XML validity is defined on.
  for (const char of value) {
    if (!isXmlCharacter(char.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

const text = z
  .string()
  .trim()
  .min(1, { error: 'must not be empty' })
  .refine(isXmlText, { error: 'must not contain control characters' });

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'expected a hex colour like "#1e3a8a"' });

const lineId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  error: 'expected a lowercase id like "aws-nyc"',
});

const date = z.union([z.int(), z.string()]).refine((value) => DATE_PATTERN.test(String(value)), {
  error: 'expected a year like 2019 or a month like "2019-03"',
});

const station = z
  .strictObject({
    title: text,
    from: date,
    to: date.optional(),
    period: text.optional(),
    org: text.optional(),
    subtitle: text.optional(),
    tags: z.array(text).min(1).optional(),
  })
  .refine((s) => s.subtitle === undefined || s.tags === undefined, {
    error: 'a station shows either a "subtitle" or "tags", not both',
    path: ['tags'],
  });

const main = z.strictObject({
  label: text.optional(),
  color,
  darkColor: color.optional(),
  origin: text.optional(),
});

const line = z.strictObject({
  id: lineId,
  label: text,
  color,
  darkColor: color.optional(),
  parent: lineId.optional(),
  ongoing: z.boolean().optional(),
  stations: z.array(station).min(1, { error: 'a line needs at least one station' }),
});

export const configSchema = z.strictObject({
  version: z.literal(1, { error: 'expected "version: 1"' }),
  title: text.optional(),
  reversed: z.boolean({ error: 'expected true or false' }).optional(),
  main,
  lines: z.array(line).min(1, { error: 'add at least one line' }),
});

export type Config = z.infer<typeof configSchema>;
export type LineConfig = Config['lines'][number];
export type StationConfig = LineConfig['stations'][number];
