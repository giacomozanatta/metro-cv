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
  readonly lane: number;
  readonly span: LineSpan;
}

/**
 * Gives every line a fixed lane.
 *
 * A line and its descendants are packed as one unit: the line sits at offset 0, and each child's
 * unit at the smallest offset from 1 up where none of its lines shares a lane with a line of the
 * unit that is on the map at the same time. Children are packed shortest-lived first (ending
 * first, then starting last), so a line whose lifetime lies inside a sibling's takes the inner
 * lane, and a whole family nested in time stays inside the line that contains it. Nested lines
 * therefore never cross; crossings remain only where lifetimes partially overlap, and there one
 * is unavoidable.
 */
export function assignLanes(timeline: Timeline, events: readonly LayoutEvent[]): LaneAssignment {
  const spans = new Map<string, LineSpan>();
  events.forEach((event, index) => {
    if (event.kind === 'branch') spans.set(event.line.id, { start: index, end: Infinity });
    if (event.kind === 'merge') {
      const span = spans.get(event.line.id);
      if (span) spans.set(event.line.id, { start: span.start, end: index });
    }
  });

  const children = new Map<string, Line[]>();
  let main: Line | undefined;
  for (const line of timeline.lines) {
    if (line.parent === null) {
      main = line;
      spans.set(line.id, { start: -Infinity, end: Infinity });
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
    const slots: Slot[] = [{ line: line.id, lane: 0, span: spanOf(line.id) }];
    for (const child of (children.get(line.id) ?? []).toSorted(packingOrder)) {
      const unit = pack(child);
      const collides = (offset: number) =>
        unit.some((slot) =>
          slots.some(
            (other) => other.lane === slot.lane + offset && overlaps(slot.span, other.span),
          ),
        );
      let offset = 1;
      while (collides(offset)) offset++;
      for (const slot of unit) slots.push({ ...slot, lane: slot.lane + offset });
    }
    return slots;
  };

  const lanes = new Map(pack(main).map((slot) => [slot.line, slot.lane]));
  const laneOf = (id: string): number => {
    const lane = lanes.get(id);
    if (lane === undefined) throw new Error(`line "${id}" has no lane`);
    return lane;
  };

  return { lanes, spans, laneCount: Math.max(...lanes.values()) + 1, laneOf, spanOf };
}

function overlaps(a: LineSpan, b: LineSpan): boolean {
  return a.start < b.end && b.start < a.end;
}
