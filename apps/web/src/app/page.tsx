"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaItem, MediaPage } from "@photovault/shared";
import { authClient } from "@/lib/auth-client";

export default function Gallery() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const loading = useRef(false);

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
          <button onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
        </span>
      </div>
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
      {items.length === 0 && done && <p>No media yet. Upload from the mobile app.</p>}
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
