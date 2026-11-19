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
  loadOlder(): Promise<void>;
  loadNewer(): Promise<void>;
  jumpTo(bucket: TimelineBucket): Promise<void>;
  jumpToNewest(): Promise<void>;
  refreshAfterUpload(): void;
  remove(id: string): void;
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

const pageUrl = (cursor?: string, dir?: "newer" | "older") => {
  const q = new URLSearchParams();
  if (cursor) q.set("cursor", cursor);
  if (cursor && dir) q.set("dir", dir);
  const s = q.toString();
  return `/api/media${s ? `?${s}` : ""}`;
};

export function useGalleryWindow(enabled: boolean): GalleryWindowApi {
  const [win, setWinState] = useState<GalleryWindow>(emptyWindow);
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [tz, setTz] = useState<string>(() => currentTimeZone());
  const [loading, setLoading] = useState(true);

  // Refs mirror state so async callbacks always see the latest window without stale closures.
  const winRef = useRef(win);
  const tzRef = useRef(tz);
  // Incremented on every jump/reset; a response from an earlier generation is discarded.
  const gen = useRef(0);
  const inflight = useRef({ older: false, newer: false });
  const timelineSeq = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setWin = useCallback((next: GalleryWindow) => {
    winRef.current = next;
    setWinState(next);
  }, []);

  const fetchTimeline = useCallback(async (zone: string) => {
    const seq = ++timelineSeq.current;
    const data = await getJson<MediaTimeline>(`/api/media/timeline?tz=${encodeURIComponent(zone)}`);
    if (data && seq === timelineSeq.current) setTimeline(data.buckets);
  }, []);

  // Replace the window with a fresh page (newest page, or the page at `cursor`).
  const reset = useCallback(
    async (cursor: string | null, zone: string, withTimeline: boolean) => {
      const g = ++gen.current;
      inflight.current = { older: false, newer: false };
      setLoading(true);
      if (withTimeline) void fetchTimeline(zone);
      const page = await getJson<MediaPage>(pageUrl(cursor ?? undefined));
      if (g !== gen.current) return;
      if (page) setWin(startWindow(page, cursor !== null));
      setLoading(false);
    },
    [fetchTimeline, setWin],
  );

  useEffect(() => {
    if (!enabled) return;
    void reset(null, tzRef.current, true);
  }, [enabled, reset]);

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
      if (!cursor || inflight.current[dir]) return;
      const g = gen.current;
      inflight.current[dir] = true;
      try {
        const data = await getJson<MediaPage>(pageUrl(cursor, dir));
        if (!data || g !== gen.current) return;
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

  // After an upload: debounced so a batch causes few refetches. Always refreshes the timeline;
  // merges page 1 only when the window reaches the newest end (mergeNewest is a no-op otherwise).
  const refreshAfterUpload = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      const g = gen.current;
      void fetchTimeline(tzRef.current);
      const data = await getJson<MediaPage>(pageUrl());
      if (!data || g !== gen.current) return;
      setWin(mergeNewest(winRef.current, data));
    }, REFRESH_DEBOUNCE_MS);
  }, [fetchTimeline, setWin]);

  const remove = useCallback(
    (id: string) => {
      setWin(removeItem(winRef.current, id));
      void fetchTimeline(tzRef.current);
    },
    [fetchTimeline, setWin],
  );

  return {
    items: win.items,
    timeline,
    tz,
    hasOlder: win.olderCursor !== null,
    hasNewer: win.newerCursor !== null,
    loading,
    loadOlder,
    loadNewer,
    jumpTo,
    jumpToNewest,
    refreshAfterUpload,
    remove,
  };
}
