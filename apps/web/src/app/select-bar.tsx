"use client";
import { countLabel } from "@/lib/count-label";

/**
 * The select-mode action bar, pinned to the bottom of the viewport. Only rendered while select
 * mode is on; Cancel is always there so the way out is always visible.
 */
export function SelectBar({
  count,
  inAlbum,
  busy,
  error,
  onCancel,
  onAdd,
  onRemove,
}: {
  count: number;
  inAlbum: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const none = count === 0;
  return (
    <div className="select-bar" role="region" aria-label="Selection">
      <span className="select-count" aria-live="polite">
        {none ? "Choose photos and videos" : `${countLabel(count)} selected`}
      </span>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      <span className="bar-actions">
        {inAlbum && (
          <button className="primary" onClick={onRemove} disabled={none || busy}>
            Remove from album
          </button>
        )}
        <button className={inAlbum ? undefined : "primary"} onClick={onAdd} disabled={none || busy}>
          Add to album…
        </button>
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </span>
    </div>
  );
}
