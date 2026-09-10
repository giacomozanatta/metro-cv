import type { Timeline } from '../model/timeline.ts';
import { err, type Result } from '../result.ts';
import type { ConfigIssue } from './issues.ts';
import { normalize } from './normalize.ts';
import { parseYaml, type ParsedYaml } from './parse.ts';
import { configSchema } from './schema.ts';

/**
 * Turns config source text into a validated {@link Timeline}. Every issue carries the position of
 * the YAML node it refers to, so users can jump straight to the mistake.
 */
export function loadTimeline(source: string): Result<Timeline, readonly ConfigIssue[]> {
  const parsed = parseYaml(source);
  if (!parsed.ok) return parsed;
  const yaml = parsed.value;

  const checked = configSchema.safeParse(yaml.data);
  if (!checked.success) {
    return err(
      checked.error.issues.map((issue) =>
        locate(yaml, {
          path: issue.path.filter((segment) => typeof segment !== 'symbol'),
          message: issue.message,
        }),
      ),
    );
  }

  const timeline = normalize(checked.data);
  if (!timeline.ok) return err(timeline.error.map((issue) => locate(yaml, issue)));
  return timeline;
}

function locate(yaml: ParsedYaml, issue: ConfigIssue): ConfigIssue {
  const position = yaml.locate(issue.path);
  return position ? { ...issue, position } : issue;
}
