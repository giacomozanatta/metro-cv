#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import packageJson from '../package.json' with { type: 'json' };
import { DARK_THEME, LIGHT_THEME } from './color/theme.ts';
import { formatIssue } from './config/issues.ts';
import { generate, type RenderedMap } from './generate.ts';
import { isNodeError, pictureSnippet, writeMap, type WrittenMap } from './node/output.ts';

const DEFAULT_CONFIG = 'metro-cv.yml';

const HELP = `Usage: metro-cv [config] [options]

Generates a metro-map career timeline as light and dark SVGs.

Arguments:
  config                YAML config file (default: ${DEFAULT_CONFIG})

Options:
  -o, --out-dir <dir>   directory for the SVGs (default: current directory)
      --png             also write PNG previews (needs the optional @resvg/resvg-js)
  -h, --help            show this help
  -v, --version         print the version
`;

function parseCommandLine(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string', short: 'o', default: '.' },
      png: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
}

/** Exit codes: 0 success, 1 the config or the files are the problem, 2 invalid usage. */
async function main(argv: readonly string[]): Promise<number> {
  let args: ReturnType<typeof parseCommandLine>;
  try {
    args = parseCommandLine(argv);
  } catch (error) {
    console.error(`metro-cv: ${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 2;
  }

  if (args.values.help) {
    console.log(HELP);
    return 0;
  }
  if (args.values.version) {
    console.log(packageJson.version);
    return 0;
  }
  if (args.positionals.length > 1) {
    console.error(`metro-cv: expected one config file, got ${args.positionals.length}\n\n${HELP}`);
    return 2;
  }

  const configPath = args.positionals[0] ?? DEFAULT_CONFIG;
  let source: string;
  try {
    source = await readFile(configPath, 'utf8');
  } catch (error) {
    const reason = isNodeError(error) && error.code === 'ENOENT' ? 'file not found' : String(error);
    console.error(`metro-cv: cannot read ${configPath}: ${reason}`);
    return 1;
  }

  const result = generate(source);
  if (!result.ok) {
    for (const issue of result.error) console.error(formatIssue(issue, configPath));
    return 1;
  }

  const written = await writeMap(args.values['out-dir'], result.value);
  console.log(`${written.changed ? 'Wrote' : 'Unchanged:'} ${written.light}, ${written.dark}`);
  if (args.values.png && !(await writePngs(result.value, written))) return 1;
  console.log(`\nAdd it to your README with:\n\n${pictureSnippet(written)}`);
  return 0;
}

/** Writes PNG copies next to the SVGs; false when the optional renderer is not installed. */
async function writePngs(map: RenderedMap, written: WrittenMap): Promise<boolean> {
  let resvg: typeof import('@resvg/resvg-js');
  try {
    resvg = await import('@resvg/resvg-js');
  } catch {
    console.error(
      'metro-cv: --png needs @resvg/resvg-js; install it with `npm i -g @resvg/resvg-js`',
    );
    return false;
  }
  for (const theme of [LIGHT_THEME, DARK_THEME]) {
    const png = new resvg.Resvg(map[theme.name], {
      background: theme.background,
      fitTo: { mode: 'zoom', value: 2 },
      font: { loadSystemFonts: true },
    })
      .render()
      .asPng();
    const path = written[theme.name].replace(/\.svg$/, '.png');
    await writeFile(path, png);
    console.log(`Wrote ${path}`);
  }
  return true;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`metro-cv: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
