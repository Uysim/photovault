import type { DayGroup, MediaItem } from "@photovault/shared";

export type Row =
  | { type: "heading"; key: string; label: string }
  | { type: "tiles"; key: string; items: MediaItem[] };

/** Flatten day groups into list rows: a heading, then rows of up to `cols` tiles. */
export function buildRows(groups: DayGroup[], cols: number): { rows: Row[]; headingIndices: number[] } {
  const rows: Row[] = [];
  const headingIndices: number[] = [];
  const per = Math.max(1, Math.floor(cols));
  for (const g of groups) {
    headingIndices.push(rows.length);
    rows.push({ type: "heading", key: `h:${g.key}`, label: g.label });
    for (let i = 0; i < g.items.length; i += per) {
      const items = g.items.slice(i, i + per);
      rows.push({ type: "tiles", key: `t:${items[0].id}`, items });
    }
  }
  return { rows, headingIndices };
}
