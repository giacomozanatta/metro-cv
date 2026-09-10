import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderedMap } from '../generate.ts';

export const OUTPUT_FILES = {
  light: 'metro-cv-light.svg',
  dark: 'metro-cv-dark.svg',
} as const;

export interface WrittenMap {
  readonly light: string;
  readonly dark: string;
  /** Whether either file was created or its content changed. */
  readonly changed: boolean;
}

/**
 * Writes both SVGs into `directory`, touching a file only when its content differs, so
 * regenerating an unchanged map leaves the working tree clean.
 */
export async function writeMap(directory: string, map: RenderedMap): Promise<WrittenMap> {
  await mkdir(directory, { recursive: true });
  const light = join(directory, OUTPUT_FILES.light);
  const dark = join(directory, OUTPUT_FILES.dark);
  const results = await Promise.all([
    writeIfChanged(light, map.light),
    writeIfChanged(dark, map.dark),
  ]);
  return { light, dark, changed: results.some(Boolean) };
}

async function writeIfChanged(path: string, content: string): Promise<boolean> {
  const current = await readFile(path, 'utf8').catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (current === content) return false;
  await writeFile(path, content);
  return true;
}

/** The `<picture>` element that shows the right SVG for the viewer's GitHub theme. */
export function pictureSnippet(
  paths: { readonly light: string; readonly dark: string },
  alt = '',
): string {
  const attr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return [
    '<picture>',
    `  <source media="(prefers-color-scheme: dark)" srcset="${attr(paths.dark)}">`,
    `  <img alt="${attr(alt)}" src="${attr(paths.light)}">`,
    '</picture>',
  ].join('\n');
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
