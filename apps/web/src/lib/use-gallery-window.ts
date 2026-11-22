"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem, MediaPage, MediaTimeline, TimelineBucket } from "@photovault/shared";
import {
  appendOlder,
  currentTimeZone,
  emptyWindow,
  jumpCursor,
  mergeNewest,
  prependNewer,
  removeItem,
  startWindow,
  type GalleryWindow,
} from "@photovault/shared";

export interface GalleryWindowApi {
  items: MediaItem[];
  timeline: TimelineBucket[];
  tz: string;
  hasOlder: boolean;
  hasNewer: boolean;
  loading: boolean;
  /** True when the latest reset failed (cleared by the next success). */
  loadError: boolean;
  loadOlder(): Promise<void>;
  loadNewer(): Promise<void>;
  jumpTo(bucket: TimelineBucket): Promise<void>;
  jumpToNewest(): Promise<void>;
  /** Retry: reset to the newest page and refetch the timeline. */
  refresh(): Promise<void>;
  refreshAfterUpload(): void;
  remove(id: string): void;
  /** Drop several items at once and refetch the timeline once. */
  removeMany(ids: string[]): void;
}

const REFRESH_DEBOUNCE_MS = 300;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const pageUrl = (cursor?: string, dir?: "newer" | "older", albumId?: string) => {
  const q = new URLSearchParams();
  if (albumId) q.set("albumId", albumId);
  if (cursor) q.set("cursor", cursor);
  if (cursor && dir) q.set("dir", dir);
  const s = q.toString();
  return `/api/media${s ? `?${s}` : ""}`;
};

export function useGalleryWindow(enabled: boolean, albumId?: string): GalleryWindowApi {
  // The empty string means "no album".
  const scope = albumId || undefined;
  // Read by async callbacks so a stale closure can never request the wrong scope.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const prevScope = useRef(scope);
  const [win, setWinState] = useState<GalleryWindow>(emptyWindow);
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [tz, setTz] = useState<string>(() => currentTimeZone());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Refs mirror state so async callbacks always see the latest window without stale closures.
  const winRef = useRef(win);
  const tzRef = useRef(tz);
  // Incremented on every jump/reset; a response from an earlier generation is discarded.
  const gen = useRef(0);
  const inflight = useRef({ older: false, newer: false });
  // True from the start of a reset/jump until its response lands: paging is blocked meanwhile.
  const resetting = useRef(false);
  const timelineSeq = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `loadError` for async callbacks: true while the latest reset has failed.
  const loadErrorRef = useRef(false);

  const setWin = useCallback((next: GalleryWindow) => {
    winRef.current = next;
    setWinState(next);
  }, []);

  const fetchTimeline = useCallback(async (zone: string) => {
    const seq = ++timelineSeq.current;
    const album = scopeRef.current;
    const data = await getJson<MediaTimeline>(
      `/api/media/timeline?tz=${encodeURIComponent(zone)}${album ? `&albumId=${encodeURIComponent(album)}` : ""}`,
    );
    if (data && seq === timelineSeq.current) setTimeline(data.buckets);
  }, []);

  // Replace the window with a fresh page (newest page, or the page at `cursor`).
  const reset = useCallback(
    async (cursor: string | null, zone: string, withTimeline: boolean) => {
      const g = ++gen.current;
      inflight.current = { older: false, newer: false };
      resetting.current = true;
      setLoading(true);
      if (withTimeline) void fetchTimeline(zone);
      const page = await getJson<MediaPage>(pageUrl(cursor ?? undefined, undefined, scopeRef.current));
      if (g !== gen.current) return;
      if (page) setWin(startWindow(page, cursor !== null));
      loadErrorRef.current = page === null;
      setLoadError(page === null);
      resetting.current = false;
      setLoading(false);
    },
    [fetchTimeline, setWin],
  );

  useEffect(() => {
    if (!enabled) return;
    if (prevScope.current !== scope) {
      // Scope changed: drop the previous album's items and any pending upload refresh.
      prevScope.current = scope;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      setWin(emptyWindow);
    }
    void reset(null, tzRef.current, true);
  }, [enabled, reset, scope, setWin]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const zone = currentTimeZone();
      if (zone === tzRef.current) return;
      tzRef.current = zone;
      setTz(zone);
      void reset(null, zone, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, reset]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const page = useCallback(
    async (dir: "older" | "newer") => {
      const w = winRef.current;
      const cursor = dir === "older" ? w.olderCursor : w.newerCursor;
      if (!cursor || resetting.current || inflight.current[dir]) return;
      const g = gen.current;
      inflight.current[dir] = true;
      try {
        const data = await getJson<MediaPage>(pageUrl(cursor, dir, scopeRef.current));
        if (!data || g !== gen.current) return;
        const now = winRef.current;
        if ((dir === "older" ? now.olderCursor : now.newerCursor) !== cursor) return;
        setWin(dir === "older" ? appendOlder(winRef.current, data) : prependNewer(winRef.current, data));
      } finally {
        if (g === gen.current) inflight.current[dir] = false;
      }
    },
    [setWin],
  );

  const loadOlder = useCallback(() => page("older"), [page]);
  const loadNewer = useCallback(() => page("newer"), [page]);
  const jumpTo = useCallback((bucket: TimelineBucket) => reset(jumpCursor(bucket), tzRef.current, false), [reset]);
  const jumpToNewest = useCallback(() => reset(null, tzRef.current, false), [reset]);

  const refresh = useCallback(() => reset(null, tzRef.current, true), [reset]);

  // After an upload: debounced so a batch causes few refetches. Always refreshes the timeline;
  // merges page 1 only when the window reaches the newest end (mergeNewest is a no-op otherwise).
  const refreshAfterUpload = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      // The last reset failed and the window is empty: it has no valid cursors, so merging page 1 would leave
      // `olderCursor` null and paging dead. Retry a full reset instead (no-op if one is pending).
      if (loadErrorRef.current && winRef.current.items.length === 0) {
        if (!resetting.current) await reset(null, tzRef.current, true);
        return;
      }
      const g = gen.current;
      void fetchTimeline(tzRef.current);
      const data = await getJson<MediaPage>(pageUrl(undefined, undefined, scopeRef.current));
      if (!data || g !== gen.current || resetting.current) return;
      setWin(mergeNewest(winRef.current, data));
      // The window is healthy and this fetch succeeded: drop any stale error from a failed jump.
      loadErrorRef.current = false;
      setLoadError(false);
    }, REFRESH_DEBOUNCE_MS);
  }, [fetchTimeline, reset, setWin]);

  const remove = useCallback(
    (id: string) => {
      setWin(removeItem(winRef.current, id));
      void fetchTimeline(tzRef.current);
    },
    [fetchTimeline, setWin],
  );

  const removeMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      let next = winRef.current;
      for (const id of ids) next = removeItem(next, id);
      setWin(next);
      void fetchTimeline(tzRef.current);
    },
    [fetchTimeline, setWin],
  );

  return {
    items: win.items,
    timeline,
    tz,
    hasOlder: !loading && win.olderCursor !== null,
    hasNewer: !loading && win.newerCursor !== null,
    loading,
    loadError,
    loadOlder,
    loadNewer,
    jumpTo,
    jumpToNewest,
    refresh,
    refreshAfterUpload,
    remove,
    removeMany,
  };
}
