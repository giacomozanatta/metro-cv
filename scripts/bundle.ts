// Bundles the Action and the CLI into self-contained ESM files under dist/. The Action runs
// straight from the repository, so dist/ is committed; CI fails if it is out of date.
import { build, type Metafile } from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const { metafile } = await build({
  entryPoints: { action: 'src/action.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // A native addon that cannot be bundled; the CLI loads it lazily for --png only.
  external: ['@resvg/resvg-js'],
  // Bundled CommonJS dependencies may call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  legalComments: 'eof',
  charset: 'utf8',
  metafile: true,
  logLevel: 'warning',
});

await writeFile('dist/licenses.txt', await thirdPartyNotices(metafile));

/** The license of every package bundled into dist/, which those licenses require us to ship. */
async function thirdPartyNotices({ inputs }: Metafile): Promise<string> {
  const packageDirs = new Set<string>();
  for (const input of Object.keys(inputs)) {
    // The greedy prefix picks the innermost node_modules for nested dependencies.
    const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (match?.[1] !== undefined) packageDirs.add(match[1]);
  }

  const notices = await Promise.all(
    [...packageDirs].map(async (dir) => {
      const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
        name: string;
        version: string;
        license?: string;
      };
      const license = manifest.license ?? 'unknown license';
      const file = (await readdir(dir)).find((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name));
      const text =
        file === undefined
          ? `(${license}; the package ships no license file)`
          : await readFile(join(dir, file), 'utf8');
      return `${manifest.name}@${manifest.version} (${license})\n\n${text.trim()}\n`;
    }),
  );

  const separator = `\n${'-'.repeat(72)}\n\n`;
  return `metro-cv bundles the following third-party packages.\n\n${notices.sort().join(separator)}`;
}
