import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { MediaPage, MediaTimeline, TimelineBucket } from "@photovault/shared";
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
import { api } from "./api";

export interface GalleryWindowApi {
  items: GalleryWindow["items"];
  timeline: TimelineBucket[];
  tz: string;
  hasOlder: boolean;
  hasNewer: boolean;
  loading: boolean;
  /** True when the latest reset/refresh failed (cleared by the next success). */
  loadError: boolean;
  loadOlder(): Promise<void>;
  loadNewer(): Promise<void>;
  jumpTo(bucket: TimelineBucket): Promise<void>;
  jumpToNewest(): Promise<void>;
  /** Pull-to-refresh / retry: reset to the newest page and refetch the timeline. */
  refresh(): Promise<void>;
  refreshAfterUpload(): void;
  remove(id: string): void;
}

const REFRESH_DEBOUNCE_MS = 300;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await api(path);
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

export function useGalleryWindow(): GalleryWindowApi {
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
  const focused = useRef(false);

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
      resetting.current = true;
      setLoading(true);
      if (withTimeline) void fetchTimeline(zone);
      const page = await getJson<MediaPage>(pageUrl(cursor ?? undefined));
      if (g !== gen.current) return;
      if (page) setWin(startWindow(page, cursor !== null));
      setLoadError(page === null);
      resetting.current = false;
      setLoading(false);
    },
    [fetchTimeline, setWin],
  );

  // Refetch the timeline and merge page 1 when the window reaches the newest end
  // (mergeNewest is a no-op otherwise). Never replaces the window, so scroll position survives.
  const syncNewest = useCallback(async () => {
    const g = gen.current;
    void fetchTimeline(tzRef.current);
    const data = await getJson<MediaPage>(pageUrl());
    if (!data || g !== gen.current || resetting.current) return;
    setWin(mergeNewest(winRef.current, data));
  }, [fetchTimeline, setWin]);

  // First focus does the initial load; later focuses (e.g. back from the viewer) never reset.
  useFocusEffect(
    useCallback(() => {
      if (!focused.current) {
        focused.current = true;
        void reset(null, tzRef.current, true);
      } else {
        void syncNewest();
      }
    }, [reset, syncNewest]),
  );

  // Time zone may change while backgrounded: reset so day boundaries match the new zone.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const zone = currentTimeZone();
      if (zone === tzRef.current) return;
      tzRef.current = zone;
      setTz(zone);
      void reset(null, zone, true);
    });
    return () => sub.remove();
  }, [reset]);

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
        const data = await getJson<MediaPage>(pageUrl(cursor, dir));
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

  // After an upload: debounced so a batch causes few refetches.
  const refreshAfterUpload = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void syncNewest(), REFRESH_DEBOUNCE_MS);
  }, [syncNewest]);

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
  };
}
