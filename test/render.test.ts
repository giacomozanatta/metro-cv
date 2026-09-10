import { SyntaxValidator } from 'fast-xml-validator';
import { describe, expect, it } from 'vitest';
import { DARK_THEME, LIGHT_THEME } from '../src/color/theme.ts';
import { generate } from '../src/generate.ts';
import { layout } from '../src/layout/layout.ts';
import { roundedPath, renderSvg } from '../src/render/svg.ts';
import { element, escapeXml, formatNumber } from '../src/render/xml.ts';
import { exampleNames, readExample, timelineOf } from './helpers.ts';
import { textContents } from './svg.ts';

describe('xml helpers', () => {
  it('formats numbers stably', () => {
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(1.005)).toBe('1');
    expect(formatNumber(2.3456)).toBe('2.35');
    expect(formatNumber(-0.001)).toBe('0');
    expect(() => formatNumber(Infinity)).toThrow();
  });

  it('escapes text and attributes', () => {
    expect(escapeXml(`Tom & "Jerry" <3 'x'`)).toBe(
      'Tom &amp; &quot;Jerry&quot; &lt;3 &apos;x&apos;',
    );
    // Children are markup, so text content must be escaped by the caller.
    expect(element('text', { x: 1.5, fill: 'a"b', skipped: undefined }, escapeXml('R&D'))).toBe(
      '<text x="1.5" fill="a&quot;b">R&amp;D</text>',
    );
    expect(element('circle', { r: 2 })).toBe('<circle r="2"/>');
  });
});

describe('roundedPath', () => {
  it('rounds each corner with a quadratic curve', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ],
      10,
    );
    expect(d).toBe('M0,0 L0,90 Q0,100 10,100 L100,100');
  });

  it('never rounds more than half a segment', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 8 },
        { x: 8, y: 8 },
      ],
      10,
    );
    expect(d).toBe('M0,0 L0,4 Q0,8 4,8 L8,8');
  });
});

describe('renderSvg', () => {
  it.each(exampleNames)('renders %s as well-formed, deterministic SVG', (name) => {
    const geometry = layout(timelineOf(readExample(name)));
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      const svg = renderSvg(geometry, theme);
      expect(SyntaxValidator.validate(svg)).toBe(true);
      expect(renderSvg(geometry, theme)).toBe(svg);
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('keeps special characters intact', () => {
    const result = generate(
      "version: 1\nmain: { label: 'R&D <team>', color: '#111111' }\nlines:\n- { id: a, label: \"Ca' Foscari\", color: '#222222', stations: [{ title: 'Q&A \"live\"', from: 2020 }] }\n",
    );
    if (!result.ok) throw new Error('config rejected');
    expect(textContents(result.value.light)).toEqual(
      expect.arrayContaining(['R&D <team>', "Ca' Foscari", 'Q&A "live"']),
    );
  });

  it('adds a <title> only when the config has one', () => {
    const base = readExample('minimal');
    const without = generate(base);
    const titled = generate(base.replace('version: 1', 'version: 1\ntitle: My career'));
    if (!without.ok || !titled.ok) throw new Error('config rejected');
    expect(without.value.light).not.toContain('<title>');
    expect(titled.value.light).toContain('<title>My career</title>');
  });
});
