export type ConfigPath = readonly (string | number)[];

export interface SourcePosition {
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
}

/** A problem with the user's config, pointing at the offending spot when it can be located. */
export interface ConfigIssue {
  readonly path: ConfigPath;
  readonly message: string;
  readonly position?: SourcePosition;
}

/** Renders a path the way users would reach it in the YAML, e.g. `lines[2].stations[0].to`. */
export function formatPath(path: ConfigPath): string {
  return path
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`,
    )
    .join('');
}

/** The message and the config path it applies to, e.g. `must not be empty (at main.label)`. */
export function describeIssue(issue: ConfigIssue): string {
  return issue.path.length > 0 ? `${issue.message} (at ${formatPath(issue.path)})` : issue.message;
}

/** Formats an issue like a compiler diagnostic: `file:line:column: message (at path)`. */
export function formatIssue(issue: ConfigIssue, file: string): string {
  const where = issue.position ? `${file}:${issue.position.line}:${issue.position.column}` : file;
  return `${where}: ${describeIssue(issue)}`;
}
