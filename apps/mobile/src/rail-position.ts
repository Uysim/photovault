import { monthOf, type MediaItem, type RailSegment } from "@photovault/shared";
import type { Row } from "./rows";

export interface RailPosition {
  year: number;
  month: number;
  /** Index of the item among the loaded items of its month ÷ that month's loaded count. */
  fraction: number;
}

/**
 * Rail position for every loaded item, keyed by id. Items are newest first, so a month's
 * items are contiguous: one pass finds each run. Each id maps to one stable object.
 */
export function monthPositions(items: MediaItem[], tz: string): Map<string, RailPosition> {
  const out = new Map<string, RailPosition>();
  let i = 0;
  while (i < items.length) {
    const m = monthOf(items[i].takenAt, tz);
    let j = i + 1;
    while (j < items.length) {
      const n = monthOf(items[j].takenAt, tz);
      if (n.year !== m.year || n.month !== m.month) break;
      j++;
    }
    const count = j - i;
    for (let k = i; k < j; k++) out.set(items[k].id, { year: m.year, month: m.month, fraction: (k - i) / count });
    i = j;
  }
  return out;
}

/**
 * The item at the top of the viewport: the first item of the topmost viewable row,
 * or of the tiles row after it when that row is a day heading.
 */
export function topItemId(rows: Row[], viewableIndices: number[]): string | null {
  if (viewableIndices.length === 0) return null;
  let i = Math.min(...viewableIndices);
  if (rows[i]?.type === "heading") i++;
  const row = rows[i];
  return row?.type === "tiles" && row.items.length > 0 ? row.items[0].id : null;
}

export interface RailTick {
  key: string;
  top: number;
  /** First (newest) month of its year: drawn longer and brighter. */
  year: boolean;
}

/**
 * One tick per month segment at its top. Year starts are always drawn; a month tick closer
 * than `minGap` to the previously drawn tick is skipped so dense months don't merge into a bar.
 */
export function railTicks(segments: RailSegment[], minGap: number): RailTick[] {
  const out: RailTick[] = [];
  segments.forEach((s, i) => {
    const year = i === 0 || segments[i - 1].year !== s.year;
    const last = out[out.length - 1];
    if (!year && last && s.top - last.top < minGap) return;
    out.push({ key: `${s.year}-${s.month}`, top: s.top, year });
  });
  return out;
}
