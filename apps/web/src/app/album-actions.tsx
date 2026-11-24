"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ALBUM_NAME_MAX, type Album } from "@photovault/shared";
import { deleteAlbum, renameAlbum } from "@/lib/albums-api";

/** Rename and Delete album, for the album view's header. Neither touches the photos. */
export function AlbumActions({ album, onRenamed }: { album: Album; onRenamed: (album: Album) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    const name = window.prompt("Album name", album.name)?.trim();
    if (!name || name === album.name) return;
    if (name.length > ALBUM_NAME_MAX) {
      setError(`Album names can be up to ${ALBUM_NAME_MAX} characters.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onRenamed(await renameAlbum(album.id, name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename album");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the album "${album.name}"? Photos stay in your library.`)) return;
    setError(null);
    setBusy(true);
    try {
      await deleteAlbum(album.id);
      router.push("/albums");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete album");
      setBusy(false);
    }
  }

  return (
    <>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      <button onClick={() => void rename()} disabled={busy}>
        Rename
      </button>
      <button onClick={() => void remove()} disabled={busy}>
        Delete album
      </button>
    </>
  );
}
