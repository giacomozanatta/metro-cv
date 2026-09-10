import type { LabelShape } from './labels.ts';
import type { LaneAssignment } from './lanes.ts';
import type { LayoutMetrics } from './metrics.ts';
import type { LayoutEvent } from './order.ts';

export interface VerticalPlacement {
  /**
   * y of every event: a station's centre, or where a branch or merge diagonal leaves its
   * starting lane. Never decreases along the event order.
   */
  readonly eventY: readonly number[];
  /** Where ongoing lines stop being solid. */
  readonly bottom: number;
}

/** Per lane, the smallest y at which the next thing may touch it. */
class LaneClearance {
  private readonly free: number[] = [];

  at(lane: number): number {
    return this.free[lane] ?? -Infinity;
  }

  raise(lane: number, y: number): void {
    this.free[lane] = Math.max(this.at(lane), y);
  }
}

/**
 * Assigns y coordinates to the ordered events, as compactly as the spacing rules allow:
 * - diagonals touching the same lane stay `laneSpacing` apart (so bends fan out in parallel),
 * - bends and stations on the same lane stay `stationGap` apart,
 * - consecutive label blocks, which share one column, stay `labelGap` apart.
 *
 * The origin station, if any, sits at y = 0.
 */
export function placeVertically(
  events: readonly LayoutEvent[],
  { laneOf }: LaneAssignment,
  labels: ReadonlyMap<number, LabelShape>,
  origin: LabelShape | undefined,
  metrics: LayoutMetrics,
): VerticalPlacement {
  const { laneSpacing, stationGap, labelGap } = metrics;
  const diagonals = new LaneClearance();
  const stations = new LaneClearance();

  let cursor = 0;
  let labelBottom = -Infinity;
  let lowest = 0;
  if (origin) {
    diagonals.raise(0, stationGap);
    labelBottom = origin.below;
  }

  const eventY = events.map((event, index) => {
    if (event.kind === 'station') {
      const lane = laneOf(event.line.id);
      const label = labels.get(index);
      if (!label) throw new Error(`station event ${index} has no label`);
      const y = Math.max(cursor, stations.at(lane), labelBottom + labelGap + label.above);
      diagonals.raise(lane, y + stationGap);
      labelBottom = y + label.below;
      cursor = y;
      lowest = Math.max(lowest, y);
      return y;
    }

    const own = laneOf(event.line.id);
    const parent = event.line.parent === null ? own : laneOf(event.line.parent);
    const [from, to] = event.kind === 'branch' ? [parent, own] : [own, parent];
    const passed = lanesBetween(from, to);
    const drop = (lane: number) => Math.abs(lane - from) * laneSpacing;

    const y = passed.reduce((top, lane) => Math.max(top, diagonals.at(lane) - drop(lane)), cursor);
    for (const lane of passed) {
      diagonals.raise(lane, y + drop(lane) + laneSpacing);
      stations.raise(lane, y + drop(lane) + stationGap);
    }
    cursor = y;
    lowest = Math.max(lowest, y + drop(to));
    return y;
  });

  return { eventY, bottom: Math.max(lowest + stationGap, labelBottom) };
}

/** Lanes from `from` to `to`, both included, in travel order. */
function lanesBetween(from: number, to: number): readonly number[] {
  const step = to >= from ? 1 : -1;
  const result: number[] = [];
  for (let lane = from; lane !== to + step; lane += step) result.push(lane);
  return result;
}
