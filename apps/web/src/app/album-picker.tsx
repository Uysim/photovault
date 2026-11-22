"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ALBUM_MEDIA_BATCH, ALBUM_NAME_MAX, type Album } from "@photovault/shared";
import { addToAlbum, ApiError, createAlbum, listAlbums, PartialCreateError } from "@/lib/albums-api";
import { countLabel } from "@/lib/count-label";

/**
 * Turns a failed add/create into words; a 400 means some ids are gone or no longer addable. Each
 * request is all-or-nothing, so with a single batch nothing was added.
 */
function failure(e: unknown, count: number, fallback: string): string {
  if (e instanceof ApiError && e.status === 400 && !(e instanceof PartialCreateError)) {
    const gone = "Some of these items are no longer in your library.";
    return count <= ALBUM_MEDIA_BATCH ? `${gone} Nothing was added.` : gone;
  }
  return e instanceof Error ? e.message : fallback;
}

/**
 * Modal that adds `mediaIds` to one of the member's albums, or to a new one. Failures show inline
 * and keep the picker open; success calls `onDone` with the album. `excludeAlbumId` hides the
 * album the member is already in.
 */
export function AlbumPicker({
  mediaIds,
  onDone,
  onClose,
  excludeAlbumId,
}: {
  mediaIds: string[];
  /** `created` is true when the album was made here with "New album". */
  onDone: (album: Album, created: boolean) => void;
  onClose: () => void;
  excludeAlbumId?: string;
}) {
  const titleId = useId();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setAlbums(await listAlbums());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Give focus back to whatever opened the picker. Read during the first render, before autoFocus
  // moves focus into the dialog. Restore only once the dialog has really left the DOM (Strict
  // Mode's simulated unmount keeps it in place).
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const node = dialog.current;
    return () => {
      window.setTimeout(() => {
        if (!node?.isConnected && opener?.isConnected) opener.focus();
      });
    };
  }, [opener]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (naming) setNaming(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, naming, onClose]);

  // Keep Tab inside the dialog.
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !dialog.current) return;
    const els = dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function run(action: () => Promise<Album>, created: boolean, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      onDone(await action(), created);
    } catch (e) {
      setError(failure(e, mediaIds.length, fallback));
      setBusy(false);
      // A create can fail after the album exists (later batches): leave the form and show it in the list.
      if (e instanceof PartialCreateError) setNaming(false);
      void load();
    }
  }

  function pick(album: Album) {
    void run(async () => {
      await addToAlbum(album.id, mediaIds);
      return album;
    }, false, "Could not add to album");
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.length > ALBUM_NAME_MAX) {
      setError(`Album names can be up to ${ALBUM_NAME_MAX} characters.`);
      return;
    }
    void run(() => createAlbum(trimmed, mediaIds), true, "Could not create album");
  }

  const shown = albums?.filter((a) => a.id !== excludeAlbumId) ?? null;

  return (
    <div className="modal picker-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={dialog}
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div className="picker-head">
          <h2 id={titleId}>Add {countLabel(mediaIds.length)} to an album</h2>
          <button onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {naming ? (
          <form className="picker-new" onSubmit={create}>
            <label htmlFor={`${titleId}-name`}>New album name</label>
            <input
              id={`${titleId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={ALBUM_NAME_MAX}
              autoFocus
              disabled={busy}
              required
            />
            <span className="bar-actions">
              <button type="submit" className="primary" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create album"}
              </button>
              <button type="button" onClick={() => setNaming(false)} disabled={busy}>
                Back
              </button>
            </span>
          </form>
        ) : (
          <ul className="picker-list">
            <li>
              <button className="picker-row picker-new-row" onClick={() => setNaming(true)} disabled={busy} autoFocus>
                <span className="album-name">New album…</span>
              </button>
            </li>
            {shown?.map((a) => (
              <li key={a.id}>
                <button className="picker-row" onClick={() => pick(a)} disabled={busy}>
                  <span className="album-name">{a.name}</span>
                  <span className="caption">
                    <span>{countLabel(a.count)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!naming && !shown && !loadError && <p className="hint">Loading albums…</p>}
        {!naming && loadError && (
          <p className="error" role="alert">
            Couldn&apos;t load your albums. <button onClick={() => void load()}>Try again</button>
          </p>
        )}
      </div>
    </div>
  );
}
