// Renders every example to SVG and PNG under preview/ for eyeballing changes. Development only.
import resvg from '@resvg/resvg-js';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { DARK_THEME, LIGHT_THEME } from '../src/color/theme.ts';
import { formatIssue } from '../src/config/issues.ts';
import { generate } from '../src/generate.ts';

const examples = new URL('../examples/', import.meta.url);
const output = new URL('../preview/', import.meta.url);
await mkdir(output, { recursive: true });

for (const file of (await readdir(examples)).filter((name) => name.endsWith('.yml')).sort()) {
  const name = file.replace(/\.yml$/, '');
  const result = generate(await readFile(new URL(file, examples), 'utf8'));
  if (!result.ok) {
    for (const issue of result.error) console.error(formatIssue(issue, `examples/${file}`));
    process.exitCode = 1;
    continue;
  }

  for (const theme of [LIGHT_THEME, DARK_THEME]) {
    const svg = result.value[theme.name];
    const png = new resvg.Resvg(svg, {
      background: theme.background,
      fitTo: { mode: 'zoom', value: 2 },
      font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Sans' },
    })
      .render()
      .asPng();
    await writeFile(new URL(`${name}-${theme.name}.svg`, output), svg);
    await writeFile(new URL(`${name}-${theme.name}.png`, output), png);
  }
  console.log(`preview/${name}-{light,dark}.{svg,png}`);
}
