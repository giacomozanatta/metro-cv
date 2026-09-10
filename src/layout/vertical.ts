import type { LabelShape } from './labels.ts';
import type { LaneAssignment } from './lanes.ts';
import type { LayoutMetrics } from './metrics.ts';
import type { LayoutEvent } from './order.ts';

/** The station where the main line begins, drawn first (oldest first) or last (newest first). */
export interface OriginPlacement {
  readonly label: LabelShape;
  readonly at: 'top' | 'bottom';
}

export interface VerticalPlacement {
  /**
   * y of every event: a station's centre, or where a branch or merge diagonal leaves its
   * starting lane. Never decreases along the event order.
   */
  readonly eventY: readonly number[];
  /** y of the origin station, when there is one. */
  readonly originY?: number;
  /** Where tracks without a merge stop: at the origin, or where they turn into a dotted tail. */
  readonly bottom: number;
  /** Lowest point of any label. */
  readonly labelBottom: number;
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
 * An origin at the top sits at y = 0; otherwise the first event leaves a short stretch of track
 * above it, and an origin at the bottom comes after the last event.
 */
export function placeVertically(
  events: readonly LayoutEvent[],
  { laneOf }: LaneAssignment,
  labels: ReadonlyMap<number, LabelShape>,
  origin: OriginPlacement | undefined,
  metrics: LayoutMetrics,
): VerticalPlacement {
  const { laneSpacing, stationGap, labelGap } = metrics;
  const diagonals = new LaneClearance();
  const stations = new LaneClearance();

  let cursor = stationGap;
  let labelBottom = -Infinity;
  let lowest = 0;
  if (origin?.at === 'top') {
    cursor = 0;
    diagonals.raise(0, stationGap);
    labelBottom = origin.label.below;
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

  if (origin?.at === 'bottom') {
    const y = Math.max(
      cursor,
      lowest + stationGap,
      stations.at(0),
      labelBottom + labelGap + origin.label.above,
    );
    return { eventY, originY: y, bottom: y, labelBottom: y + origin.label.below };
  }
  return {
    eventY,
    ...(origin && { originY: 0 }),
    bottom: Math.max(lowest + stationGap, labelBottom),
    labelBottom,
  };
}

/** Lanes from `from` to `to`, both included, in travel order. */
function lanesBetween(from: number, to: number): readonly number[] {
  const step = to >= from ? 1 : -1;
  const result: number[] = [];
  for (let lane = from; lane !== to + step; lane += step) result.push(lane);
  return result;
}
