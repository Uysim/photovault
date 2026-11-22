import type { DayGroup, MediaItem } from "@photovault/shared";

export type Row =
  | { type: "heading"; key: string; label: string }
  | { type: "tiles"; key: string; items: MediaItem[] };

/**
 * Flatten day groups into list rows: a heading, then rows of up to `cols` tiles.
 *
 * `firstGroupFromEnd`: chunk the FIRST group from the end of its item list, so a
 * partial row sits directly under the heading and existing full rows keep their
 * `t:<first id>` keys when newer items are prepended (keeps the
 * maintainVisibleContentPosition anchor alive). Pass `hasNewer`. Accepted
 * tradeoff: a window that is a single day with `hasNewer` re-chunks when older
 * pages are appended, and the first group re-chunks once when `hasNewer` flips
 * to false.
 */
export function buildRows(groups: DayGroup[], cols: number, firstGroupFromEnd = false): { rows: Row[]; headingIndices: number[] } {
  const rows: Row[] = [];
  const headingIndices: number[] = [];
  const per = Math.max(1, Math.floor(cols));
  groups.forEach((g, gi) => {
    headingIndices.push(rows.length);
    rows.push({ type: "heading", key: `h:${g.key}`, label: g.label });
    const n = g.items.length;
    let i = 0;
    if (firstGroupFromEnd && gi === 0 && n % per !== 0) {
      const items = g.items.slice(0, n % per);
      rows.push({ type: "tiles", key: `t:${items[0].id}`, items });
      i = n % per;
    }
    for (; i < n; i += per) {
      const items = g.items.slice(i, i + per);
      rows.push({ type: "tiles", key: `t:${items[0].id}`, items });
    }
  });
  return { rows, headingIndices };
}
