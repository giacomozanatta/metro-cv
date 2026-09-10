import type { LaneAssignment } from './lanes.ts';
import type { LayoutEvent } from './order.ts';

/** A branch or merge diagonal passing over a lane where another line is running. */
export interface Crossing {
  readonly eventIndex: number;
  /** The line drawn on top (the one bending). */
  readonly line: string;
  /** The line passed over. */
  readonly under: string;
  readonly lane: number;
}

export function findCrossings(
  events: readonly LayoutEvent[],
  { lanes, spans }: LaneAssignment,
): readonly Crossing[] {
  const linesByLane = new Map<number, string[]>();
  for (const [id, lane] of lanes) linesByLane.set(lane, [...(linesByLane.get(lane) ?? []), id]);

  const crossings: Crossing[] = [];
  events.forEach((event, eventIndex) => {
    if (event.kind === 'station' || event.line.parent === null) return;
    const from = lanes.get(event.line.parent);
    const to = lanes.get(event.line.id);
    if (from === undefined || to === undefined) return;

    for (let lane = Math.min(from, to) + 1; lane < Math.max(from, to); lane++) {
      for (const under of linesByLane.get(lane) ?? []) {
        const span = spans.get(under);
        if (span && span.start < eventIndex && eventIndex < span.end) {
          crossings.push({ eventIndex, line: event.line.id, under, lane });
        }
      }
    }
  });
  return crossings;
}
