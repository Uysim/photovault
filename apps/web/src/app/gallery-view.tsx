"use client";
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupByDay, monthOf, type Album, type MediaItem, type TimelineBucket } from "@photovault/shared";
import { authClient } from "@/lib/auth-client";
import { ApiError, getAlbum, removeFromAlbum } from "@/lib/albums-api";
import { countLabel } from "@/lib/count-label";
import { useGalleryWindow } from "@/lib/use-gallery-window";
import { uploadFile, validateFile } from "@/lib/upload";
import { AlbumActions } from "./album-actions";
import { AlbumPicker } from "./album-picker";
import { Notice, useNotice } from "./notice";
import { SelectBar } from "./select-bar";
import { TimelineRail, type RailPosition } from "./timeline-rail";
import { useSelection } from "./use-selection";

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

type AlbumState = { status: "loading" } | { status: "ready"; album: Album } | { status: "missing" } | { status: "error" };

/**
 * The gallery: the member's whole library, or one album of it when `albumId` is set. Album mode
 * scopes the window (headings, rail, paging) to the album and drops upload (photos are uploaded
 * to the library, then added). Render it with `key={albumId}` so switching albums mounts fresh.
 */
export function GalleryView({ albumId }: { albumId?: string } = {}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const inAlbum = !!albumId;
  const [albumState, setAlbumState] = useState<AlbumState>({ status: "loading" });
  const [albumTry, setAlbumTry] = useState(0);

  useEffect(() => {
    if (!session || !albumId) return;
    let live = true;
    setAlbumState({ status: "loading" });
    getAlbum(albumId).then(
      (album) => live && setAlbumState({ status: "ready", album }),
      // A 404 covers missing and not-owned alike.
      (e: unknown) => live && setAlbumState({ status: e instanceof ApiError && e.status === 404 ? "missing" : "error" }),
    );
    return () => {
      live = false;
    };
  }, [session, albumId, albumTry]);

  const gallery = useGalleryWindow(!!session, albumId);
  const { items, timeline, tz, hasOlder, hasNewer, loading, loadError, refresh: retryLoad, loadOlder, loadNewer, jumpTo, jumpToNewest, refreshAfterUpload: refresh } = gallery;
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
    if (inAlbum) {
      // No uploading into an album (upload to the library, then add), but still stop the
      // browser from navigating away to a file dropped on the page.
      const refuse = (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
      };
      window.addEventListener("dragover", refuse);
      window.addEventListener("drop", refuse);
      return () => {
        window.removeEventListener("dragover", refuse);
        window.removeEventListener("drop", refuse);
      };
    }
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
  }, [addFiles, inAlbum]);

  async function remove(item: MediaItem) {
    if (!confirm("Delete this item permanently?")) return;
    await fetch(`/api/media/${item.id}`, { method: "DELETE" });
    gallery.remove(item.id);
    setOpen(null);
  }

  // Album membership: the picker (from the selection or the viewer) and removing from this album.
  // Removing only unlinks; deleting a photo is the viewer's separate Delete.
  const [picking, setPicking] = useState<{ ids: string[]; fromSelection: boolean } | null>(null);
  const selection = useSelection(!!picking);
  const [selectBusy, setSelectBusy] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const { notice, show: showNotice } = useNotice();

  const exitSelect = selection.exit;
  const startSelect = () => {
    setSelectError(null);
    selection.start();
  };
  // Escape leaves select mode inside useSelection; clear a leftover error however it was left.
  useEffect(() => {
    if (!selection.active) setSelectError(null);
  }, [selection.active]);

  function picked(album: Album, created: boolean, count: number) {
    if (picking?.fromSelection) exitSelect();
    setPicking(null);
    showNotice({
      text: created ? `Created “${album.name}” with ${countLabel(count)}.` : `Added ${countLabel(count)} to “${album.name}”.`,
      href: `/albums/${album.id}`,
      linkText: "Open album",
    });
  }

  async function unlink(ids: string[]) {
    const done: string[] = [];
    try {
      await removeFromAlbum(albumId!, ids, (batch) => done.push(...batch));
    } catch (e) {
      // Earlier batches may have gone through: unselect those and reload the album from the server.
      selection.drop(done);
      void retryLoad();
      throw e;
    }
    gallery.removeMany(ids);
  }

  // A picker add failed because some ids are gone (deleted elsewhere): reload the gallery, then
  // keep only selected ids that the refreshed window still shows, so the member can retry as is.
  const pruneAfterLoad = useRef(false);
  const onStale = () => {
    pruneAfterLoad.current = true;
    void retryLoad();
  };
  useEffect(() => {
    if (!pruneAfterLoad.current || loading) return;
    pruneAfterLoad.current = false;
    if (loadError) return;
    const shown = new Set(items.map((i) => i.id));
    const gone = [...selection.ids].filter((id) => !shown.has(id));
    if (gone.length === 0) return;
    selection.drop(gone);
    setPicking((p) => (p?.fromSelection ? { ...p, ids: p.ids.filter((id) => shown.has(id)) } : p));
  }, [loading, loadError, items, selection]);

  async function removeSelected() {
    setSelectError(null);
    setSelectBusy(true);
    try {
      await unlink([...selection.ids]);
      exitSelect();
    } catch (e) {
      setSelectError(e instanceof Error ? e.message : "Could not remove from album");
    } finally {
      setSelectBusy(false);
    }
  }

  async function removeOpen(item: MediaItem) {
    setViewerError(null);
    try {
      await unlink([item.id]);
      setOpen(null);
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : "Could not remove from album");
    }
  }

  useEffect(() => setViewerError(null), [open]);

  useEffect(() => {
    if (!open || picking) return; // the picker owns Escape while it is up
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, picking]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const uploading = uploads.some((u) => u.status === "uploading");

  if (!session) return null;
  if (inAlbum && (albumState.status === "missing" || albumState.status === "error")) {
    const missing = albumState.status === "missing";
    return (
      <>
        <div className="bar">
          <div className="bar-title">
            <Link className="back" href="/albums">← Albums</Link>
          </div>
        </div>
        <div className="page">
          <div className="empty" role="alert">
            <p>{missing ? "Album not found." : "Couldn't load this album."}</p>
            {missing ? (
              <Link className="btn" href="/albums">Back to albums</Link>
            ) : (
              <button onClick={() => setAlbumTry((n) => n + 1)}>Try again</button>
            )}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className={`bar${timeline.length > 0 ? " with-rail" : ""}`}>
        {inAlbum ? (
          <div className="bar-title">
            <Link className="back" href="/albums">← Albums</Link>
            <h1>{albumState.status === "ready" ? albumState.album.name : ""}</h1>
          </div>
        ) : (
          <h1>PhotoVault</h1>
        )}
        {inAlbum && (
          <div className="bar-actions">
            {items.length > 0 && !selection.active && <button onClick={startSelect}>Select</button>}
            {albumState.status === "ready" && (
              <AlbumActions album={albumState.album} onRenamed={(album) => setAlbumState({ status: "ready", album })} />
            )}
          </div>
        )}
        {!inAlbum && (
          <div className="bar-actions">
            {items.length > 0 && !selection.active && <button onClick={startSelect}>Select</button>}
            <Link className="btn" href="/albums">Albums</Link>
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
        )}
      </div>
      {/* Before the page in the DOM so Tab reaches the rail ahead of the tiles; it is position: fixed. */}
      {!open && <TimelineRail buckets={timeline} active={active} onJump={onJump} onJumpNewest={onJumpNewest} />}
      {dragging && <div className="drop-overlay">Drop to add to your library</div>}
      <div className={`page${timeline.length > 0 ? " with-rail" : ""}`}>
        {!inAlbum && (
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
        )}
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
                  <button
                    className="tile"
                    {...(selection.active
                      ? { onClick: () => selection.toggle(i.id), "aria-pressed": selection.ids.has(i.id), "aria-label": `Select ${i.filename}` }
                      : { onClick: () => setOpen(i), "aria-label": `Open ${i.filename}` })}
                  >
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
        {/* In an album, wait for the album itself: a missing one has its own state above. */}
        {items.length === 0 && !hasOlder && !loading && loadError && (!inAlbum || albumState.status === "ready") && (
          <div className="empty" role="alert">
            <p>{inAlbum ? "Couldn't load this album." : "Couldn't load your library."}</p>
            <button onClick={() => void retryLoad()}>Try again</button>
          </div>
        )}
        {items.length === 0 && !hasOlder && !loading && !loadError && (
          <p className="empty">
            {inAlbum
              ? "This album is empty. Add photos from your library."
              : "This page is empty. Add the first photos or videos with Upload or by dropping them here."}
          </p>
        )}
      </div>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={open.filename} onClick={() => setOpen(null)}>
          <div className="viewer" onClick={(e) => e.stopPropagation()}>
            {open.kind === "video" ? <video src={open.url} controls autoPlay /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={open.url} alt={open.filename} />}
            <div className="viewer-bar">
              <span className="name">{open.filename} · {fmtDate(open.takenAt)}</span>
              <span className="bar-actions">
                {viewerError && <span className="error" role="alert">{viewerError}</span>}
                {inAlbum ? (
                  <button className="primary" onClick={() => void removeOpen(open)}>Remove from album</button>
                ) : (
                  <button onClick={() => setPicking({ ids: [open.id], fromSelection: false })}>Add to album…</button>
                )}
                <button className="danger" onClick={() => remove(open)}>Delete</button>
                <button onClick={() => setOpen(null)} autoFocus>Close</button>
              </span>
            </div>
          </div>
        </div>
      )}
      {selection.active && (
        <SelectBar
          count={selection.ids.size}
          inAlbum={inAlbum}
          busy={selectBusy}
          error={selectError}
          onCancel={exitSelect}
          onAdd={() => setPicking({ ids: [...selection.ids], fromSelection: true })}
          onRemove={() => void removeSelected()}
        />
      )}
      {picking && (
        <AlbumPicker
          mediaIds={picking.ids}
          excludeAlbumId={albumId}
          onStale={onStale}
          onDone={(album, created) => picked(album, created, picking.ids.length)}
          onClose={() => setPicking(null)}
        />
      )}
      <Notice notice={notice} />
    </>
  );
}
