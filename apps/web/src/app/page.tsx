"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { groupByDay, type MediaItem } from "@photovault/shared";
import { authClient } from "@/lib/auth-client";
import { useGalleryWindow } from "@/lib/use-gallery-window";
import { uploadFile, validateFile } from "@/lib/upload";

type UploadRow = { key: string; name: string; progress: number; status: "uploading" | "done" | "error"; error?: string };
const MAX_PARALLEL = 3;

export default function Gallery() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const gallery = useGalleryWindow(!!session);
  const { items, tz, hasOlder, loading, loadOlder, refreshAfterUpload: refresh } = gallery;
  const [open, setOpen] = useState<MediaItem | null>(null);
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
      <div className="page">
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
        {groupByDay(items, tz).map((day) => (
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
          <div className="more">
            <button onClick={() => void loadOlder()}>Load more</button>
          </div>
        )}
        {items.length === 0 && !hasOlder && !loading && <p className="empty">This page is empty. Add the first photos or videos with Upload or by dropping them here.</p>}
      </div>
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
