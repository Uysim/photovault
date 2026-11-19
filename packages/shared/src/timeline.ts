import type { MediaItem } from "./index";

export interface TimelineBucket {
  year: number;
  month: number; // 1-12
  count: number;
  before: string;
}

export interface MediaTimeline {
  buckets: TimelineBucket[]; // newest first
}

export interface DayGroup {
  key: string;
  label: string;
  items: MediaItem[];
}

export interface RailSegment {
  year: number;
  month: number;
  count: number;
  before: string;
  top: number;
  height: number;
}

export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatParts(
  iso: string,
  tz: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): Record<string, string> {
  const date = new Date(iso);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).formatToParts(date);
  }
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

const pad = (n: number | string, len: number) => String(n).padStart(len, "0");

export function monthOf(iso: string, tz: string): { year: number; month: number } {
  const p = formatParts(iso, tz, { year: "numeric", month: "numeric" }, "en-US");
  return { year: Number(p.year), month: Number(p.month) };
}

export function dayKey(iso: string, tz: string): string {
  const p = formatParts(iso, tz, { year: "numeric", month: "numeric", day: "numeric" }, "en-US");
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
}

export function dayLabel(iso: string, tz: string, locale?: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
    } catch {
      return dayKey(iso, "UTC");
    }
  }
}

export function groupByDay(items: MediaItem[], tz: string, locale?: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKey(item.takenAt, tz);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(item.takenAt, tz, locale), items: [item] });
    }
  }
  return groups;
}

export function jumpCursor(bucket: TimelineBucket): string {
  return `${bucket.before}|`;
}

export function layoutRail(
  buckets: TimelineBucket[],
  trackHeight: number,
  minSegment: number,
): RailSegment[] {
  const n = buckets.length;
  if (n === 0) return [];
  const floor = Math.min(minSegment, trackHeight / n);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const free = trackHeight - floor * n;
  const heights = buckets.map((b) => floor + (total > 0 ? (free * b.count) / total : free / n));
  let top = 0;
  return buckets.map((b, i) => {
    const height = i === n - 1 ? trackHeight - top : heights[i];
    const seg: RailSegment = {
      year: b.year,
      month: b.month,
      count: b.count,
      before: b.before,
      top,
      height,
    };
    top += heights[i];
    return seg;
  });
}

export function segmentAtY(segments: RailSegment[], y: number): RailSegment | null {
  if (segments.length === 0) return null;
  if (y <= segments[0].top) return segments[0];
  for (const s of segments) {
    if (y < s.top + s.height) return s;
  }
  return segments[segments.length - 1];
}

export function railYFor(
  segments: RailSegment[],
  at: { year: number; month: number },
  fraction: number,
): number | null {
  const s = segments.find((x) => x.year === at.year && x.month === at.month);
  return s ? s.top + s.height * fraction : null;
}

/**
 * One label per year at the top of the year's first segment, newest first. When a year's label
 * would sit closer than `minGap` to the previously kept label, the year that spans more track
 * height keeps the slot (ties keep the newer year), so a tiny current-year segment can't hide
 * the year below it.
 */
export function yearLabels(
  segments: RailSegment[],
  minGap: number,
): { year: number; top: number }[] {
  const years: { year: number; top: number; span: number }[] = [];
  for (const s of segments) {
    const last = years[years.length - 1];
    if (last && last.year === s.year) last.span += s.height;
    else years.push({ year: s.year, top: s.top, span: s.height });
  }
  const kept: { year: number; top: number; span: number }[] = [];
  for (const y of years) {
    const last = kept[kept.length - 1];
    if (!last || y.top - last.top >= minGap) kept.push(y);
    else if (y.span > last.span) kept[kept.length - 1] = y;
  }
  return kept.map(({ year, top }) => ({ year, top }));
}
