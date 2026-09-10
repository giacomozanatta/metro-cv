import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const MINIMAL = fileURLToPath(new URL('../examples/minimal.yml', import.meta.url));
const execFileAsync = promisify(execFile);

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function cli(...args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === 'number' ? failed.code : -1,
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
    };
  }
}

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'metro-cv-cli-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('metro-cv CLI', () => {
  it('writes both SVGs and exits 0', async () => {
    const run = await cli(MINIMAL, '--out-dir', directory);
    expect(run.code).toBe(0);
    await access(join(directory, 'metro-cv-light.svg'));
    await access(join(directory, 'metro-cv-dark.svg'));
    expect(run.stdout).toContain('<picture>');
  });

  it('exits 1 with positioned diagnostics for an invalid config', async () => {
    const config = join(directory, 'invalid.yml');
    await writeFile(config, 'version: 1\nmain: { label: Me, color: blue }\nlines: []\n');
    const run = await cli(config, '--out-dir', directory);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`${config}:2:27: expected a hex colour like "#1e3a8a"`);
  });

  it('exits 1 when the config file is missing', async () => {
    const run = await cli(join(directory, 'missing.yml'));
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('file not found');
  });

  it('exits 2 for invalid usage', async () => {
    expect((await cli('--no-such-option')).code).toBe(2);
    expect((await cli('a.yml', 'b.yml')).code).toBe(2);
  });

  it('prints its version', async () => {
    const run = await cli('--version');
    expect(run.stdout.trim()).toBe(packageJson.version);
  });
});
