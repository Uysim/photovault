import type { MediaItem, MediaPage } from "./index";

export interface GalleryWindow {
  items: MediaItem[];
  olderCursor: string | null;
  newerCursor: string | null; // null <=> the window reaches the newest photo
}

export const emptyWindow: GalleryWindow = {
  items: [],
  olderCursor: null,
  newerCursor: null,
};

export function cursorOf(item: MediaItem): string {
  return `${item.takenAt}|${item.id}`;
}

function unseen(w: GalleryWindow, items: MediaItem[]): MediaItem[] {
  const seen = new Set(w.items.map((i) => i.id));
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

export function startWindow(page: MediaPage, jumped: boolean): GalleryWindow {
  const first = page.items[0];
  return {
    items: [...page.items],
    olderCursor: page.nextCursor,
    newerCursor: jumped && first ? cursorOf(first) : null,
  };
}

export function appendOlder(w: GalleryWindow, page: MediaPage): GalleryWindow {
  return {
    ...w,
    items: [...w.items, ...unseen(w, page.items)],
    olderCursor: page.nextCursor,
  };
}

export function prependNewer(w: GalleryWindow, page: MediaPage): GalleryWindow {
  return {
    ...w,
    items: [...unseen(w, page.items), ...w.items],
    newerCursor: page.nextCursor,
  };
}

export function mergeNewest(w: GalleryWindow, page: MediaPage): GalleryWindow {
  if (w.newerCursor !== null) return w;
  const added = unseen(w, page.items);
  if (added.length === 0) return w;
  const merged = [...w.items, ...added];
  merged.sort((a, b) =>
    a.takenAt !== b.takenAt
      ? a.takenAt < b.takenAt ? 1 : -1
      : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  );
  return { ...w, items: merged };
}

export function removeItem(w: GalleryWindow, id: string): GalleryWindow {
  return { ...w, items: w.items.filter((i) => i.id !== id) };
}

export function isAtNewest(w: GalleryWindow): boolean {
  return w.newerCursor === null;
}
