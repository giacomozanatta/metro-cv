import { compareNumbers } from '../compare.ts';
import type { Line, Timeline } from '../model/timeline.ts';
import type { LayoutEvent } from './order.ts';

/** When a line is on the map, in ordinal time (event indices). Ongoing lines never end. */
export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

export interface LaneAssignment {
  /** Lane of every line; the main line is lane 0 and lanes grow to the right. */
  readonly lanes: ReadonlyMap<string, number>;
  readonly spans: ReadonlyMap<string, LineSpan>;
  readonly laneCount: number;
  /** Lane of a line. Throws for unknown ids, which would be a bug in an earlier stage. */
  readonly laneOf: (id: string) => number;
  /** Span of a line. Throws for unknown ids, which would be a bug in an earlier stage. */
  readonly spanOf: (id: string) => LineSpan;
}

interface Slot {
  readonly line: string;
  /** The line it branches off, once that line is part of the same unit. */
  readonly parent: string | undefined;
  readonly lane: number;
  readonly span: LineSpan;
}

/**
 * Gives every line a fixed lane.
 *
 * A line and its descendants are packed as one unit: the line sits at offset 0 and each child's
 * unit at an offset from 1 up where none of its lines shares a lane with a line of the unit that
 * is on the map at the same time. Children are packed shortest-lived first (ending first, then
 * starting last), so a line whose lifetime lies inside a sibling's takes the inner lane.
 *
 * Among the offsets that fit, the lowest one that adds no crossing between two lines nested in
 * time is chosen, or else the one adding the fewest. When every line branches off the main line,
 * this means nested lines never cross; with deeper families a crossing between nested lines is
 * only left when no free offset avoids it. Crossings between lines whose lifetimes partially
 * overlap are unavoidable and drawn as bridges.
 */
export function assignLanes(timeline: Timeline, events: readonly LayoutEvent[]): LaneAssignment {
  // A line without a branch or merge event stays on the map from the top, or to the bottom.
  const spans = new Map<string, LineSpan>(
    timeline.lines.map((line) => [line.id, { start: -Infinity, end: Infinity }]),
  );
  events.forEach((event, index) => {
    const span = spans.get(event.line.id);
    if (span && event.kind === 'branch') spans.set(event.line.id, { ...span, start: index });
    if (span && event.kind === 'merge') spans.set(event.line.id, { ...span, end: index });
  });

  const children = new Map<string, Line[]>();
  let main: Line | undefined;
  for (const line of timeline.lines) {
    if (line.parent === null) {
      main = line;
    } else {
      children.set(line.parent, [...(children.get(line.parent) ?? []), line]);
    }
  }
  if (!main) throw new Error('the timeline has no main line');

  const spanOf = (id: string): LineSpan => {
    const span = spans.get(id);
    if (!span) throw new Error(`line "${id}" has no span`);
    return span;
  };
  const packingOrder = (a: Line, b: Line): number => {
    const sa = spanOf(a.id);
    const sb = spanOf(b.id);
    return (
      compareNumbers(sa.end, sb.end) ||
      compareNumbers(sb.start, sa.start) ||
      compareNumbers(a.order, b.order)
    );
  };

  const pack = (line: Line): Slot[] => {
    const slots: Slot[] = [{ line: line.id, parent: undefined, lane: 0, span: spanOf(line.id) }];
    for (const child of (children.get(line.id) ?? []).toSorted(packingOrder)) {
      const unit = pack(child);
      const placed = (offset: number): Slot[] =>
        unit.map((slot) => ({ ...slot, lane: slot.lane + offset, parent: slot.parent ?? line.id }));
      const collides = (candidate: readonly Slot[]) =>
        candidate.some((slot) =>
          slots.some((other) => other.lane === slot.lane && overlaps(slot.span, other.span)),
        );

      // Past the outermost lane nothing can collide, and every further offset would cross the
      // same lines, so the search ends there.
      const outermost = Math.max(...slots.map((slot) => slot.lane)) + 1;
      let best: { readonly slots: Slot[]; readonly crossings: number } | undefined;
      for (let offset = 1; offset <= outermost && best?.crossings !== 0; offset++) {
        const candidate = placed(offset);
        if (collides(candidate)) continue;
        const crossings = nestedCrossings(slots, candidate);
        if (!best || crossings < best.crossings) best = { slots: candidate, crossings };
      }
      if (!best) throw new Error(`no lane found for "${child.id}"`);
      slots.push(...best.slots);
    }
    return slots;
  };

  return makeAssignment(new Map(pack(main).map((slot) => [slot.line, slot.lane])), spans);
}

/**
 * The lanes of the same map drawn newest first: every line keeps its lane and its span is
 * mirrored in time, so switching the order never moves a line.
 */
export function reverseAssignment(assignment: LaneAssignment, eventCount: number): LaneAssignment {
  const mirror = (index: number) => eventCount - 1 - index;
  const spans = new Map(
    [...assignment.spans].map(([id, span]) => [
      id,
      { start: mirror(span.end), end: mirror(span.start) },
    ]),
  );
  return makeAssignment(assignment.lanes, spans);
}

function makeAssignment(
  lanes: ReadonlyMap<string, number>,
  spans: ReadonlyMap<string, LineSpan>,
): LaneAssignment {
  return {
    lanes,
    spans,
    laneCount: Math.max(...lanes.values()) + 1,
    laneOf: (id) => found(lanes.get(id), `line "${id}" has no lane`),
    spanOf: (id) => found(spans.get(id), `line "${id}" has no span`),
  };
}

function found<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function overlaps(a: LineSpan, b: LineSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function nested(a: LineSpan, b: LineSpan): boolean {
  const contains = (outer: LineSpan, inner: LineSpan) =>
    outer.start <= inner.start && inner.end <= outer.end;
  return contains(a, b) || contains(b, a);
}

/**
 * How many crossings between lines nested in time placing `candidate` next to `placed` would add:
 * a bend of one group passing over a line of the other group that is on the map at that moment.
 */
function nestedCrossings(placed: readonly Slot[], candidate: readonly Slot[]): number {
  const all = [...placed, ...candidate];
  const laneOf = new Map(all.map((slot) => [slot.line, slot.lane]));
  const inCandidate = new Set(candidate.map((slot) => slot.line));

  let count = 0;
  for (const bending of all) {
    const from = bending.parent === undefined ? undefined : laneOf.get(bending.parent);
    if (from === undefined) continue;
    const low = Math.min(from, bending.lane);
    const high = Math.max(from, bending.lane);
    for (const moment of [bending.span.start, bending.span.end]) {
      if (!Number.isFinite(moment)) continue;
      for (const other of all) {
        const acrossGroups = inCandidate.has(other.line) !== inCandidate.has(bending.line);
        const between = other.lane > low && other.lane < high;
        const running = other.span.start < moment && moment < other.span.end;
        if (acrossGroups && between && running && nested(bending.span, other.span)) count++;
      }
    }
  }
  return count;
}
