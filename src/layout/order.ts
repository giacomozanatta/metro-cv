import { compareNumbers } from '../compare.ts';
import type { Line, Station, Timeline } from '../model/timeline.ts';

/** Something that happens on the map, top to bottom. */
export type LayoutEvent =
  | { readonly kind: 'branch'; readonly line: Line }
  | { readonly kind: 'station'; readonly line: Line; readonly station: Station }
  | { readonly kind: 'merge'; readonly line: Line };

interface EventNode {
  readonly event: LayoutEvent;
  /** Priority among events that are ready at the same time; compared lexicographically. */
  readonly key: readonly number[];
  readonly successors: EventNode[];
  pendingPredecessors: number;
}

// Among ready events sharing a date: stations first, then merges (freeing lanes), then branches.
const STATION_RANK = 0;
const MERGE_RANK = 1;
const BRANCH_RANK = 2;

/**
 * Orders all branch, station and merge events. The position of an event in the result is the
 * ordinal time used by every later layout stage.
 *
 * Hard constraints come from the structure: a line branches, visits its stations in date order and
 * merges; a child branches after its parent and merges before it. Among events whose constraints
 * are met, the earliest date wins, with ties broken so that:
 * - merges close the most recently opened line first, and
 * - branches open the longest-lived line first,
 * which lets nested lines take inner lanes without crossing their siblings.
 *
 * Every constraint points forward in time on a validated timeline, so dates never decrease along
 * the result. Kahn's algorithm with a linear scan is O(n²), which is fine for the dozens of events
 * in a career.
 */
export function orderEvents(timeline: Timeline): readonly LayoutEvent[] {
  const branches = new Map<string, EventNode>();
  const merges = new Map<string, EventNode>();
  const nodes: EventNode[] = [];

  const add = (event: LayoutEvent, key: readonly number[], after?: EventNode): EventNode => {
    const node: EventNode = { event, key, successors: [], pendingPredecessors: 0 };
    nodes.push(node);
    if (after) link(after, node);
    return node;
  };

  for (const line of timeline.lines) {
    if (line.parent === null) continue;
    const start: number = line.start;
    const end: number = line.ongoing ? Infinity : line.end;

    let previous = add({ kind: 'branch', line }, [
      start,
      BRANCH_RANK,
      -end,
      line.depth,
      line.order,
    ]);
    branches.set(line.id, previous);

    line.stations.forEach((station, i) => {
      previous = add(
        { kind: 'station', line, station },
        [station.from, STATION_RANK, line.order, i],
        previous,
      );
    });

    if (!line.ongoing) {
      const merge = add(
        { kind: 'merge', line },
        [end, MERGE_RANK, -start, -line.depth, -line.order],
        previous,
      );
      merges.set(line.id, merge);
    }
  }

  for (const line of timeline.lines) {
    if (line.parent === null) continue;
    const parentBranch = branches.get(line.parent);
    const ownBranch = branches.get(line.id);
    if (parentBranch && ownBranch) link(parentBranch, ownBranch);
    const parentMerge = merges.get(line.parent);
    const ownMerge = merges.get(line.id);
    if (parentMerge && ownMerge) link(ownMerge, parentMerge);
  }

  const ready = nodes.filter((node) => node.pendingPredecessors === 0);
  const ordered: LayoutEvent[] = [];
  while (ready.length > 0) {
    const next = removeMin(ready);
    ordered.push(next.event);
    for (const successor of next.successors) {
      successor.pendingPredecessors -= 1;
      if (successor.pendingPredecessors === 0) ready.push(successor);
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error('event constraints form a cycle; the timeline was not validated');
  }
  return ordered;
}

function link(from: EventNode, to: EventNode): void {
  from.successors.push(to);
  to.pendingPredecessors += 1;
}

function removeMin(ready: EventNode[]): EventNode {
  const best = ready.reduce((min, node) => (compareKeys(node.key, min.key) < 0 ? node : min));
  ready.splice(ready.indexOf(best), 1);
  return best;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (const [i, value] of a.entries()) {
    const other = b[i];
    if (other === undefined) return 1;
    const order = compareNumbers(value, other);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}
