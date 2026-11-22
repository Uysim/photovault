"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { layoutRail, railYFor, segmentAtY, yearLabels, type TimelineBucket } from "@photovault/shared";

export interface RailPosition {
  year: number;
  month: number;
  fraction: number;
}

interface Props {
  buckets: TimelineBucket[];
  active: RailPosition | null;
  onJump(bucket: TimelineBucket): void;
  onJumpNewest(): void;
}

const MIN_SEGMENT = 4;
const LABEL_GAP = 20;
const LABEL_H = 16;
// Movement (px) below which a press counts as a tap rather than a drag.
const TAP_SLOP = 5;

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

type Drag = { pointerId: number; startY: number; y: number; moved: boolean; snapYear: number | null };

export function TimelineRail({ buckets, active, onJump, onJumpNewest }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const empty = buckets.length === 0;
  const dragging = drag !== null;

  // The track only exists while there are buckets, so re-attach when that flips.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // Measure once now: ResizeObserver only reports on a rendered frame (not while the tab is hidden).
    setHeight(Math.round(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);

  const segments = useMemo(() => (height > 0 ? layoutRail(buckets, height, MIN_SEGMENT) : []), [buckets, height]);
  const labels = useMemo(() => yearLabels(segments, LABEL_GAP), [segments]);

  const setDragState = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // Escape cancels a drag without jumping.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const d = dragRef.current;
      if (d) trackRef.current?.releasePointerCapture?.(d.pointerId);
      setDragState(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  if (empty) return null;

  const yOf = (e: ReactPointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
  };

  const bucketAt = (y: number): TimelineBucket | null => {
    const seg = segmentAtY(segments, y);
    if (!seg) return null;
    return buckets[segments.indexOf(seg)] ?? null;
  };

  const firstOfYear = (year: number) => buckets.find((b) => b.year === year) ?? null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || segments.length === 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const label = (e.target as HTMLElement).closest<HTMLElement>("[data-year]");
    const y = yOf(e);
    setDragState({ pointerId: e.pointerId, startY: y, y, moved: false, snapYear: label ? Number(label.dataset.year) : null });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const y = yOf(e);
    if (y === d.y) return;
    setDragState({ ...d, y, moved: d.moved || Math.abs(y - d.startY) > TAP_SLOP });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDragState(null);
    // A tap on a year label lands on that year's newest month; otherwise the month under the pointer.
    const target = !d.moved && d.snapYear !== null ? firstOfYear(d.snapYear) : bucketAt(d.y);
    if (target) onJump(target);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) setDragState(null);
  };

  const dragBucket = drag ? bucketAt(drag.y) : null;
  const thumbY = drag ? drag.y : active ? railYFor(segments, active, active.fraction) : null;

  return (
    <nav className={`rail${drag ? " dragging" : ""}`} aria-label="Timeline">
      <button type="button" className="rail-latest" onClick={onJumpNewest} aria-label="Jump to latest">
        Latest
      </button>
      <div
        ref={trackRef}
        className="rail-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        <div className="rail-line" aria-hidden="true" />
        {segments.map((s, i) => (
          <div
            key={`${s.year}-${s.month}`}
            className={`rail-tick${i > 0 && segments[i - 1].year !== s.year ? " year" : ""}`}
            style={{ top: s.top }}
            aria-hidden="true"
          />
        ))}
        {labels.map((l) => (
          <button
            key={l.year}
            type="button"
            className="rail-year"
            data-year={l.year}
            style={{ top: Math.min(l.top, Math.max(0, height - LABEL_H)) }}
            aria-label={`Jump to ${l.year}`}
            // Pointer presses are handled by the track (tap or drag); this only serves keyboard activation.
            onClick={(e) => {
              if (e.detail !== 0) return;
              const b = firstOfYear(l.year);
              if (b) onJump(b);
            }}
          >
            {l.year}
          </button>
        ))}
        {thumbY !== null && <div className="rail-thumb" style={{ transform: `translateY(${thumbY}px)` }} aria-hidden="true" />}
        {drag && dragBucket && (
          <div className="rail-bubble" style={{ transform: `translateY(${drag.y}px)` }} role="status">
            {monthLabel(dragBucket.year, dragBucket.month)}
          </div>
        )}
      </div>
    </nav>
  );
}
