// Tiny in-process pub/sub so the viewer screen can tell the gallery an item was deleted.
type Listener = (id: string) => void;

const deletedListeners = new Set<Listener>();

export function emitDeleted(id: string): void {
  for (const cb of [...deletedListeners]) cb(id);
}

/** Subscribe to deletions; returns the unsubscribe function. */
export function onDeleted(cb: Listener): () => void {
  deletedListeners.add(cb);
  return () => {
    deletedListeners.delete(cb);
  };
}

type RemovedListener = (albumId: string, mediaId: string) => void;

const removedFromAlbumListeners = new Set<RemovedListener>();

/** Tell open album views that an item was taken out of an album (e.g. from the viewer). */
export function emitRemovedFromAlbum(albumId: string, mediaId: string): void {
  for (const cb of [...removedFromAlbumListeners]) cb(albumId, mediaId);
}

/** Subscribe to album removals; returns the unsubscribe function. */
export function onRemovedFromAlbum(cb: RemovedListener): () => void {
  removedFromAlbumListeners.add(cb);
  return () => {
    removedFromAlbumListeners.delete(cb);
  };
}
