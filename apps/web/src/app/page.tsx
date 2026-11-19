"use client";
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { groupByDay, monthOf, type MediaItem, type TimelineBucket } from "@photovault/shared";
import { authClient } from "@/lib/auth-client";
import { useGalleryWindow } from "@/lib/use-gallery-window";
import { uploadFile, validateFile } from "@/lib/upload";
import { TimelineRail, type RailPosition } from "./timeline-rail";

type UploadRow = { key: string; name: string; progress: number; status: "uploading" | "done" | "error"; error?: string };
const MAX_PARALLEL = 3;
// Start fetching the next page this far before its sentinel scrolls into view.
const PREFETCH_MARGIN = "800px 0px";

/**
 * Keeps the viewport still when newer items are prepended. getSnapshotBeforeUpdate reads the
 * document height right before React mutates the DOM; componentDidUpdate (layout phase, before
 * paint) adds the growth to scrollTop. Only an update that lands while the window had a newer
 * page pending (a `loadNewer` result) counts; resets/jumps and upload merges are left alone.
 */
class KeepScrollOnPrepend extends Component<{ items: MediaItem[]; hasNewer: boolean; children: ReactNode }> {
  getSnapshotBeforeUpdate(prev: { items: MediaItem[]; hasNewer: boolean }): number | null {
    const next = this.props.items;
    if (!prev.hasNewer || prev.items === next || prev.items.length === 0) return null;
    const k = next.length - prev.items.length;
    if (k <= 0 || next[k]?.id !== prev.items[0].id) return null;
    return document.documentElement.scrollHeight;
  }

  componentDidUpdate(_: unknown, __: unknown, before: number | null) {
    if (before === null) return;
    const delta = document.documentElement.scrollHeight - before;
    if (delta > 0) window.scrollTo(0, window.scrollY + delta);
  }

  render() {
    return <div className="gallery">{this.props.children}</div>;
  }
}

/** Index of the first `.cell` whose bottom edge is below the viewport top (cells are in document order). */
function firstVisibleCell(cells: NodeListOf<HTMLElement>): HTMLElement | null {
  let lo = 0;
  let hi = cells.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cells[mid].getBoundingClientRect().bottom > 0) hi = mid;
    else lo = mid + 1;
  }
  return cells[lo] ?? null;
}

export default function Gallery() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const gallery = useGalleryWindow(!!session);
  const { items, timeline, tz, hasOlder, hasNewer, loading, loadOlder, loadNewer, jumpTo, jumpToNewest, refreshAfterUpload: refresh } = gallery;
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [active, setActive] = useState<RailPosition | null>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const days = useMemo(() => groupByDay(items, tz), [items, tz]);

  // id -> rail position: the item's month and its index among loaded items of that month.
  const positions = useMemo(() => {
    const byMonth = new Map<string, string[]>();
    for (const i of items) {
      const m = monthOf(i.takenAt, tz);
      const key = `${m.year}-${m.month}`;
      const list = byMonth.get(key);
      if (list) list.push(i.id);
      else byMonth.set(key, [i.id]);
    }
    const out = new Map<string, RailPosition>();
    for (const [key, ids] of byMonth) {
      const [year, month] = key.split("-").map(Number);
      ids.forEach((id, idx) => out.set(id, { year, month, fraction: idx / ids.length }));
    }
    return out;
  }, [items, tz]);

  // Rail thumb follows the first visible cell; rAF-throttled, state only changes when the value does.
  useEffect(() => {
    if (!session) return;
    let frame = 0;
    const compute = () => {
      frame = 0;
      if (loading) return; // a jump is in flight: keep the optimistic position set by the jump
      const cell = firstVisibleCell(document.querySelectorAll<HTMLElement>(".cell[data-id]"));
      const next = cell ? positions.get(cell.dataset.id ?? "") ?? null : null;
      setActive((prev) =>
        prev === next || (prev && next && prev.year === next.year && prev.month === next.month && prev.fraction === next.fraction) ? prev : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [session, positions, loading]);

  // Automatic paging at both ends. Re-created whenever the list changes so a sentinel that is
  // still in view after a page lands (short pages) triggers the next one.
  useEffect(() => {
    if (!hasNewer && !hasOlder) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === topSentinel.current) void loadNewer();
          else if (e.target === bottomSentinel.current) void loadOlder();
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    if (hasNewer && topSentinel.current) io.observe(topSentinel.current);
    if (hasOlder && bottomSentinel.current) io.observe(bottomSentinel.current);
    return () => io.disconnect();
  }, [hasNewer, hasOlder, items, loadNewer, loadOlder]);

  // After a jump lands, pin the target month's first heading to the viewport top (before paint),
  // so the newer page fetched right after it prepends out of sight instead of filling the space
  // above the target where the top bar and drop strip were.
  const jumpLanding = useRef(false);
  useLayoutEffect(() => {
    if (!jumpLanding.current || loading) return;
    jumpLanding.current = false;
    const first = document.querySelector(".gallery .day");
    if (first) window.scrollTo(0, first.getBoundingClientRect().top + window.scrollY);
  }, [loading, items]);

  const onJump = useCallback(
    (bucket: TimelineBucket) => {
      setActive({ year: bucket.year, month: bucket.month, fraction: 0 });
      jumpLanding.current = true;
      void jumpTo(bucket);
      window.scrollTo(0, 0);
    },
    [jumpTo],
  );

  const onJumpNewest = useCallback(() => {
    jumpLanding.current = false;
    void jumpToNewest();
    window.scrollTo(0, 0);
  }, [jumpToNewest]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const addFiles = useCallback(
    (files: File[]) => {
      const rows = files.map((f, i) => ({ file: f, key: `${Date.now()}-${i}-${f.name}` }));
      setUploads((prev) => [...prev, ...rows.map((r) => ({ key: r.key, name: r.file.name, progress: 0, status: "uploading" as const }))]);
      const patch = (key: string, p: Partial<UploadRow>) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...p } : u)));

      const queue = [...rows];
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const { file, key } = next;
          const invalid = validateFile(file);
          if (invalid) {
            patch(key, { status: "error", error: invalid });
            continue;
          }
          try {
            await uploadFile(file, (progress) => patch(key, { progress }));
            patch(key, { status: "done", progress: 1 });
            refresh();
          } catch (e) {
            patch(key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
          }
        }
      };
      for (let i = 0; i < Math.min(MAX_PARALLEL, rows.length); i++) void worker();
    },
    [refresh],
  );

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer!.files));
    };
    window.addEventListener("dragenter", over);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", over);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  async function remove(item: MediaItem) {
    if (!confirm("Delete this item permanently?")) return;
    await fetch(`/api/media/${item.id}`, { method: "DELETE" });
    gallery.remove(item.id);
    setOpen(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const uploading = uploads.some((u) => u.status === "uploading");

  if (!session) return null;
  return (
    <>
      <div className="bar">
        <h1>PhotoVault</h1>
        <div className="bar-actions">
          {(session.user as { role?: string }).role === "admin" && <a className="btn" href="/admin">Invites</a>}
          <button className="primary" onClick={() => fileInput.current?.click()}>Upload</button>
          <button onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {dragging && <div className="drop-overlay">Drop to add to the album</div>}
      <div className={`page${timeline.length > 0 ? " with-rail" : ""}`}>
        <div className={`dropstrip${dragging || uploading ? " active" : ""}`}>
          <p>Drop photos and videos anywhere on this page, or press Upload.</p>
          {uploads.length > 0 && (
            <div className="uploads" aria-live="polite">
              {uploads.map((u) => (
                <div key={u.key} className={`upload-row${u.status === "error" ? " fail" : ""}`}>
                  <span className="name">{u.name}</span>
                  {u.status === "error" ? (
                    <span className="error">{u.error}</span>
                  ) : (
                    <>
                      <progress value={u.progress} max={1} aria-label={`Uploading ${u.name}`} />
                      <span className="state">{u.status === "done" ? "Added" : `${Math.round(u.progress * 100)}%`}</span>
                    </>
                  )}
                </div>
              ))}
              <div>
                <button onClick={() => setUploads((prev) => prev.filter((u) => u.status === "uploading"))}>Clear finished</button>
              </div>
            </div>
          )}
        </div>
        <KeepScrollOnPrepend items={items} hasNewer={hasNewer}>
        {hasNewer && (
          <div ref={topSentinel} className="more newer">
            <button onClick={() => void loadNewer()}>Show newer</button>
          </div>
        )}
        {days.map((day) => (
          <section key={day.key} className="day">
            <h2 className="day-heading">{day.label}</h2>
            <div className="grid">
              {day.items.map((i) => (
                <div key={i.id} className="cell" data-id={i.id}>
                  <button className="tile" onClick={() => setOpen(i)} aria-label={`Open ${i.filename}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.thumbUrl} alt="" loading="lazy" draggable={false} />
                  </button>
                  {i.kind === "video" && (
                    <div className="caption">
                      <span>Video {Math.round((i.durationMs ?? 0) / 1000)}s</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {hasOlder && (
          <div ref={bottomSentinel} className="more">
            <button onClick={() => void loadOlder()}>Load more</button>
          </div>
        )}
        </KeepScrollOnPrepend>
        {items.length === 0 && !hasOlder && !loading && <p className="empty">This page is empty. Add the first photos or videos with Upload or by dropping them here.</p>}
      </div>
      {!open && <TimelineRail buckets={timeline} active={active} onJump={onJump} onJumpNewest={onJumpNewest} />}
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={open.filename} onClick={() => setOpen(null)}>
          <div className="viewer" onClick={(e) => e.stopPropagation()}>
            {open.kind === "video" ? <video src={open.url} controls autoPlay /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={open.url} alt={open.filename} />}
            <div className="viewer-bar">
              <span className="name">{open.filename} · {fmtDate(open.takenAt)}</span>
              <span className="bar-actions">
                <button className="danger" onClick={() => remove(open)}>Delete</button>
                <button onClick={() => setOpen(null)} autoFocus>Close</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
