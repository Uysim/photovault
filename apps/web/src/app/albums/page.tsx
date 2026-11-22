"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ALBUM_NAME_MAX, type Album } from "@photovault/shared";
import { authClient } from "@/lib/auth-client";
import { createAlbum, listAlbums } from "@/lib/albums-api";

const countLabel = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

export default function AlbumsPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setAlbums(await listAlbums());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function newAlbum() {
    const name = window.prompt("Album name")?.trim();
    if (!name) return;
    if (name.length > ALBUM_NAME_MAX) {
      setCreateError(`Album names can be up to ${ALBUM_NAME_MAX} characters.`);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const album = await createAlbum(name);
      router.push(`/albums/${album.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create album");
      setCreating(false);
    }
  }

  if (!session) return null;
  return (
    <>
      <div className="bar">
        <div className="bar-title">
          <Link className="back" href="/">← Library</Link>
          <h1>Albums</h1>
        </div>
        <div className="bar-actions">
          <button className="primary" onClick={() => void newAlbum()} disabled={creating}>New album</button>
        </div>
      </div>
      <div className="page">
        {createError && <p className="error" role="alert">{createError}</p>}
        {loadError && (
          <div className="empty" role="alert">
            <p>Couldn&apos;t load your albums.</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        )}
        {albums && albums.length === 0 && (
          <div className="empty">
            <p>No albums yet.</p>
            <p>Start one with New album, then add photos from your library.</p>
          </div>
        )}
        {albums && albums.length > 0 && (
          <ul className="grid albums">
            {albums.map((a) => (
              <li key={a.id}>
                <Link className="album-card" href={`/albums/${a.id}`}>
                  <span className="tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.coverThumbUrl && <img src={a.coverThumbUrl} alt="" loading="lazy" draggable={false} />}
                  </span>
                  <span className="album-name">{a.name}</span>
                  <span className="caption">
                    <span>{countLabel(a.count)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
