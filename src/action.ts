import * as core from '@actions/core';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { describeIssue } from './config/issues.ts';
import { generate } from './generate.ts';
import { isNodeError, pictureSnippet, writeMap } from './node/output.ts';

const execFileAsync = promisify(execFile);

// The identity GitHub shows for commits made with the workflow's own token.
const BOT_IDENTITY = {
  GIT_AUTHOR_NAME: 'github-actions[bot]',
  GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'github-actions[bot]',
  GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
};
const PUSH_ATTEMPTS = 3;

type Git = (...args: string[]) => Promise<string>;

async function run(): Promise<void> {
  const configPath = core.getInput('config', { required: true });
  const outputDir = core.getInput('output-dir', { required: true });
  const commit = core.getBooleanInput('commit');
  const commitMessage = core.getInput('commit-message', { required: true });

  const result = generate(await readConfig(configPath));
  if (!result.ok) {
    for (const issue of result.error) {
      // Annotations carry the position themselves and show inline on the config file.
      core.error(describeIssue(issue), {
        file: configPath,
        ...(issue.position && {
          startLine: issue.position.line,
          startColumn: issue.position.column,
        }),
      });
    }
    core.setFailed(`${configPath} has ${result.error.length} problem(s)`);
    return;
  }

  const written = await writeMap(outputDir, result.value);
  core.setOutput('light', written.light);
  core.setOutput('dark', written.dark);
  core.setOutput('changed', written.changed);
  core.info(written.changed ? `Updated ${written.light} and ${written.dark}` : 'Map unchanged');
  core.info(`Show it in your README with:\n${pictureSnippet(written)}`);

  if (commit) await commitAndPush([written.light, written.dark], commitMessage);
}

async function readConfig(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(
        `config file ${path} not found. Paths are relative to the repository root: check the ` +
          '"config" input, and that actions/checkout runs before this step.',
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Commits the two SVGs, and only them, when they differ from what is committed, then pushes.
 * Deciding with git rather than with `changed` keeps this right even when an earlier step
 * already wrote the files.
 */
async function commitAndPush(paths: readonly [string, string], message: string): Promise<void> {
  const directory = dirname(paths[0]);
  const git = gitIn(directory);

  if (!(await succeeds(git('rev-parse', '--is-inside-work-tree')))) {
    throw new Error(
      `${directory} is not inside a git repository: run actions/checkout first, or leave "commit" off`,
    );
  }
  const branch = await git('symbolic-ref', '--quiet', '--short', 'HEAD').catch(() => {
    throw new Error(
      'cannot commit on a detached HEAD: run this action on push or workflow_dispatch events',
    );
  });
  for (const path of paths) {
    if (await succeeds(git('check-ignore', '--quiet', '--', path))) {
      throw new Error(
        `${path} is ignored by git: choose an "output-dir" whose files are committed`,
      );
    }
  }

  if ((await git('status', '--porcelain', '--', ...paths)) === '') {
    core.info('The committed map is already up to date');
    return;
  }
  await git('add', '--', ...paths);
  await git('commit', '--quiet', '--message', message, '--', ...paths);
  await push(git, branch);
  core.info(`Committed and pushed the map to ${branch}`);
}

/** Pushes, rebasing onto the remote branch and retrying when another run pushed first. */
async function push(git: Git, branch: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await git('push', 'origin', `HEAD:refs/heads/${branch}`);
      return;
    } catch (error) {
      if (attempt >= PUSH_ATTEMPTS) throw error;
      core.info(`Push rejected; rebasing onto origin/${branch} and retrying`);
      try {
        await git('pull', '--rebase', '--autostash', 'origin', branch);
      } catch (rebaseError) {
        await git('rebase', '--abort').catch(() => undefined);
        throw new Error(
          `could not rebase the map commit onto origin/${branch}, probably because another run ` +
            'changed the same files; add a concurrency group to the workflow',
          { cause: rebaseError },
        );
      }
    }
  }
}

/** Runs git in `cwd` as the bot, turning failures into errors that carry git's own explanation. */
function gitIn(cwd: string): Git {
  return async (...args) => {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        env: { ...process.env, ...BOT_IDENTITY },
      });
      return stdout.trim();
    } catch (error) {
      const stderr = hasStderr(error) ? error.stderr.trim() : '';
      throw new Error(`git ${args[0] ?? ''} failed${stderr === '' ? '' : `: ${stderr}`}`, {
        cause: error,
      });
    }
  };
}

function succeeds(promise: Promise<unknown>): Promise<boolean> {
  return promise.then(
    () => true,
    () => false,
  );
}

function hasStderr(error: unknown): error is { stderr: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'stderr' in error &&
    typeof error.stderr === 'string'
  );
}

try {
  await run();
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
