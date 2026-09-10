import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pictureSnippet, writeMap } from '../src/node/output.ts';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'metro-cv-output-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('writeMap', () => {
  it('creates missing directories and reports a change only when content differs', async () => {
    const target = join(directory, 'nested', 'out');
    const map = { light: '<svg>light</svg>', dark: '<svg>dark</svg>' };

    const first = await writeMap(target, map);
    expect(first).toEqual({
      light: join(target, 'metro-cv-light.svg'),
      dark: join(target, 'metro-cv-dark.svg'),
      changed: true,
    });
    expect(await readFile(first.light, 'utf8')).toBe(map.light);
    expect(await readFile(first.dark, 'utf8')).toBe(map.dark);

    expect((await writeMap(target, map)).changed).toBe(false);
    expect((await writeMap(target, { ...map, dark: '<svg>new</svg>' })).changed).toBe(true);
  });
});

describe('pictureSnippet', () => {
  it('escapes attribute values', () => {
    expect(pictureSnippet({ light: 'a"b.svg', dark: 'x&y.svg' }, 'Me & "you"')).toBe(
      [
        '<picture>',
        '  <source media="(prefers-color-scheme: dark)" srcset="x&amp;y.svg">',
        '  <img alt="Me &amp; &quot;you&quot;" src="a&quot;b.svg">',
        '</picture>',
      ].join('\n'),
    );
  });
});
