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
