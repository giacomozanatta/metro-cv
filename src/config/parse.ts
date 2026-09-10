import { isNode, LineCounter, parseDocument } from 'yaml';
import { err, ok, type Result } from '../result.ts';
import type { ConfigIssue, ConfigPath, SourcePosition } from './issues.ts';

export interface ParsedYaml {
  readonly data: unknown;
  /** Source position of the deepest existing node along `path`. */
  readonly locate: (path: ConfigPath) => SourcePosition | undefined;
}

/** Parses YAML while keeping enough of the document around to map config paths to positions. */
export function parseYaml(source: string): Result<ParsedYaml, readonly ConfigIssue[]> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, uniqueKeys: true });

  if (doc.errors.length > 0) {
    return err(
      doc.errors.map((error): ConfigIssue => {
        const start = error.linePos?.[0];
        return {
          path: [],
          message: firstLine(error.message),
          ...(start && { position: { line: start.line, column: start.col } }),
        };
      }),
    );
  }

  const locate = (path: ConfigPath): SourcePosition | undefined => {
    for (let depth = path.length; depth >= 0; depth--) {
      const node: unknown = doc.getIn(path.slice(0, depth), true);
      if (isNode(node) && node.range) {
        const { line, col } = lineCounter.linePos(node.range[0]);
        return { line, column: col };
      }
    }
    return undefined;
  };

  return ok({ data: doc.toJS() as unknown, locate });
}

// yaml's messages end with a source excerpt; positions already carry that information.
function firstLine(message: string): string {
  return message.split('\n', 1)[0] ?? message;
}
