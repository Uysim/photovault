"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaItem, MediaPage } from "@photovault/shared";
import { authClient } from "@/lib/auth-client";
import { uploadFile, validateFile } from "@/lib/upload";

type UploadRow = { key: string; name: string; progress: number; status: "uploading" | "done" | "error"; error?: string };
const MAX_PARALLEL = 3;

export default function Gallery() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const loading = useRef(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (c: string | null) => {
    if (loading.current) return;
    loading.current = true;
    const res = await fetch(`/api/media${c ? `?cursor=${encodeURIComponent(c)}` : ""}`);
    if (res.ok) {
      const page: MediaPage = await res.json();
      setItems((prev) => (c ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setDone(!page.nextCursor);
    }
    loading.current = false;
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
    else if (session) load(null);
  }, [isPending, session, router, load]);

  const refresh = useCallback(async () => {
    // load() ignores calls while another load is running, so wait for it.
    for (let i = 0; i < 20 && loading.current; i++) await new Promise((r) => setTimeout(r, 100));
    await load(null);
  }, [load]);

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
            await refresh();
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
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setOpen(null);
  }

  if (!session) return null;
  return (
    <>
      <div className="bar">
        <h1>PhotoVault</h1>
        <span>
          {(session.user as { role?: string }).role === "admin" && <a href="/admin">Invites</a>}{" "}
          <button onClick={() => fileInput.current?.click()}>Upload</button>{" "}
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
        </span>
      </div>
      {dragging && <div className="drop-overlay">Drop to upload</div>}
      {uploads.length > 0 && (
        <div className="uploads">
          {uploads.map((u) => (
            <div key={u.key} className="upload-row">
              <span>{u.name}</span>
              {u.status === "error" ? <span className="upload-error">{u.error}</span> : <progress value={u.progress} max={1} />}
            </div>
          ))}
          <button onClick={() => setUploads((prev) => prev.filter((u) => u.status === "uploading"))}>Clear</button>
        </div>
      )}
      <div className="grid">
        {items.map((i) => (
          <button key={i.id} className="tile" onClick={() => setOpen(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.thumbUrl} alt={i.filename} loading="lazy" />
            {i.kind === "video" && <span className="badge">▶ {Math.round((i.durationMs ?? 0) / 1000)}s</span>}
          </button>
        ))}
      </div>
      {!done && <p><button onClick={() => load(cursor)}>Load more</button></p>}
      {items.length === 0 && done && <p>No media yet. Drop files here or click Upload.</p>}
      {open && (
        <div className="modal" onClick={() => setOpen(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            {open.kind === "video" ? <video src={open.url} controls autoPlay /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={open.url} alt={open.filename} />}
            <p style={{ color: "#fff" }}>
              {open.filename} <button onClick={() => remove(open)}>Delete</button> <button onClick={() => setOpen(null)}>Close</button>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
