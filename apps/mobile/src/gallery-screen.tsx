import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { groupByDay, type Album, type TimelineBucket } from "@photovault/shared";
import { authClient } from "./api";
import { useAlbumActions } from "./album-actions";
import { AlbumPicker } from "./album-picker";
import { ApiError, getAlbum, removeFromAlbum } from "./albums-api";
import { countLabel } from "./count-label";
import { onDeleted, onGalleryStale, onRemovedFromAlbum } from "./gallery-events";
import { Notice, useNotice } from "./notice";
import { monthPositions, topItemId } from "./rail-position";
import { buildRows, type Row } from "./rows";
import { SelectBar } from "./select-bar";
import { RAIL_WIDTH, TimelineRail } from "./timeline-rail";
import { useGalleryWindow } from "./use-gallery-window";
import { useSelection } from "./use-selection";
import { uploadAsset, type UploadState } from "./upload";
import { color, font, radius } from "./theme";
import { Btn } from "./ui";

type ImagePickerAsset = ImagePicker.ImagePickerAsset;
type ViewableInfo = Parameters<NonNullable<ComponentProps<typeof FlatList<Row>>["onViewableItemsChanged"]>>[0];
type Job = UploadState & { asset: ImagePickerAsset };
type AlbumState = { status: "loading" } | { status: "ready"; album: Album } | { status: "missing" } | { status: "error" };
type Picking = { ids: string[]; fromSelection: boolean };

const GAP = 3;
const MAX_ROWS = 3;

function columnsFor(width: number) {
  return width >= 900 ? 6 : width >= 600 ? 5 : 3;
}

/**
 * The gallery: the member's whole library, or one album of it when `albumId` is set. Album mode
 * scopes the window (headings, rail, paging) to the album and drops upload (photos are uploaded
 * to the library, then added). Render it with `key={albumId}` so switching albums mounts fresh.
 */
export function GalleryScreen({ albumId }: { albumId?: string } = {}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = columnsFor(width);
  const inAlbum = !!albumId;

  const [albumState, setAlbumState] = useState<AlbumState>({ status: "loading" });
  const [albumTry, setAlbumTry] = useState(0);
  useEffect(() => {
    if (!albumId) return;
    let live = true;
    setAlbumState({ status: "loading" });
    getAlbum(albumId).then(
      (album) => live && setAlbumState({ status: "ready", album }),
      // A 404 covers missing and not-owned alike.
      (e: unknown) => live && setAlbumState({ status: e instanceof ApiError && e.status === 404 ? "missing" : "error" }),
    );
    return () => {
      live = false;
    };
  }, [albumId, albumTry]);
  const album = albumState.status === "ready" ? albumState.album : null;
  const albumActions = useAlbumActions(album, (a) => setAlbumState({ status: "ready", album: a }));

  const gallery = useGalleryWindow(albumId);
  const {
    items, timeline, tz, loading, loadError, hasOlder, hasNewer,
    loadOlder, loadNewer, jumpTo, jumpToNewest, refresh, refreshAfterUpload, remove,
  } = gallery;
  const { rows, headingIndices } = useMemo(() => buildRows(groupByDay(items, tz), cols, hasNewer), [items, tz, cols, hasNewer]);

  // The rail's strip is reserved (not overlaid) whenever there are photos, so a tap on a tile's
  // edge is never read as a scrub, and the grid doesn't resize when the timeline arrives.
  const railPad = items.length > 0 ? RAIL_WIDTH : 0;
  const size = (width - railPad - GAP * (cols - 1)) / cols;

  // Rail position: the first item of the top visible row. FlatList requires these two props to
  // keep one identity for the list's lifetime, so they live in refs and read rows through a ref.
  const listRef = useRef<FlatList<Row>>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [topId, setTopId] = useState<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: ViewableInfo) => {
    const indices = viewableItems.filter((v) => v.isViewable && v.index !== null).map((v) => v.index as number);
    setTopId(topItemId(rowsRef.current, indices)); // same id → React skips the render
  }).current;
  const positions = useMemo(() => monthPositions(items, tz), [items, tz]);
  const active = (topId !== null && positions.get(topId)) || null;

  // After a jump, put the target month's first heading at the top once the new window has
  // committed (scrolling before it lands would leave the old window's offset in place).
  // The immediate onStartReached → loadNewer then prepends above, and
  // maintainVisibleContentPosition keeps the first tile row where it is.
  const scrollTopPending = useRef(false);
  useEffect(() => {
    if (!scrollTopPending.current || loading) return;
    scrollTopPending.current = false;
    // A failed jump leaves the old window in place: leave the user where they were.
    if (!loadError) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [items, loading, loadError]);
  const onJump = useCallback(
    (bucket: TimelineBucket) => {
      scrollTopPending.current = true;
      void jumpTo(bucket);
    },
    [jumpTo],
  );
  const onJumpNewest = useCallback(() => {
    scrollTopPending.current = true;
    void jumpToNewest();
  }, [jumpToNewest]);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef<Job[]>([]);
  const running = useRef(false);

  useEffect(() => onDeleted(remove), [remove]);
  // The viewer took an item out of this album.
  useEffect(
    () => onRemovedFromAlbum((fromAlbum, mediaId) => {
      if (albumId && fromAlbum === albumId) remove(mediaId);
    }),
    [albumId, remove],
  );
  // The viewer's add found items that are gone: reload so they drop out of the grid.
  useEffect(() => onGalleryStale(() => void refresh()), [refresh]);

  const setAllJobs = (next: Job[]) => {
    jobsRef.current = next;
    setJobs(next);
  };
  const patch = (key: string, p: Partial<UploadState>) =>
    setAllJobs(jobsRef.current.map((j) => (j.key === key ? { ...j, ...p } : j)));

  // One runner drains the queue sequentially (predictable memory and bandwidth).
  async function drain() {
    if (running.current) return;
    running.current = true;
    try {
      let next: Job | undefined;
      while ((next = jobsRef.current.find((j) => j.status === "queued"))) {
        const { key, asset } = next;
        patch(key, { status: "uploading", progress: 0, error: undefined });
        try {
          await uploadAsset(asset, (p) => patch(key, { progress: p }));
          setAllJobs(jobsRef.current.filter((j) => j.key !== key));
        } catch (e) {
          patch(key, { status: "error", error: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      running.current = false;
      refreshAfterUpload();
    }
  }

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert("Allow photo access", "PhotoVault needs access to your library to upload. You can turn it on in Settings.");
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      exif: true,
      quality: 1, // don't re-encode
    });
    if (result.canceled) return;

    const stamp = Date.now();
    const queued: Job[] = result.assets.map((a, i) => ({
      asset: a,
      key: `${stamp}-${i}`,
      name: a.fileName ?? `Item ${i + 1}`,
      progress: 0,
      status: "queued",
    }));
    setAllJobs([...jobsRef.current, ...queued]);
    drain();
  }

  function retryFailed() {
    setAllJobs(jobsRef.current.map((j) => (j.status === "error" ? { ...j, status: "queued", error: undefined } : j)));
    drain();
  }

  // Album membership: the picker (from the selection) and removing from this album. Removing only
  // unlinks; deleting a photo is the viewer's separate Delete.
  const selection = useSelection();
  const { ids: selectedIds, drop: dropSelected, exit: exitSelect } = selection;
  const [picking, setPicking] = useState<Picking | null>(null);
  // The picker keeps showing the last ids while it slides away.
  const lastPicking = useRef<Picking | null>(null);
  if (picking) lastPicking.current = picking;
  const [selectBusy, setSelectBusy] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const { notice, show: showNotice, hide: hideNotice } = useNotice();
  // FlatList rows only re-render when data or extraData change: hand it the selection's identity.
  const selectionView = useMemo(() => ({ active: selection.active, ids: selectedIds }), [selection.active, selectedIds]);

  const startSelect = (id?: string) => {
    setSelectError(null);
    selection.start(id);
  };
  // However select mode was left (Cancel, back, leaving the screen), drop a leftover error.
  useEffect(() => {
    if (!selection.active) setSelectError(null);
  }, [selection.active]);

  function picked(a: Album, created: boolean, count: number) {
    if (picking?.fromSelection) exitSelect();
    setPicking(null);
    showNotice({
      text: created ? `Created “${a.name}” with ${countLabel(count)}.` : `Added ${countLabel(count)} to “${a.name}”.`,
      action: { label: "Open album", onPress: () => router.push({ pathname: "/album/[id]", params: { id: a.id } }) },
    });
  }

  async function unlink(ids: string[]) {
    const done: string[] = [];
    try {
      await removeFromAlbum(albumId!, ids, (batch) => done.push(...batch));
    } catch (e) {
      // Earlier batches may have gone through: unselect those and reload the album from the server.
      dropSelected(done);
      void refresh();
      throw e;
    }
    gallery.removeMany(ids);
  }

  // A picker add failed because some ids are gone (deleted elsewhere): reload the gallery, then
  // keep only selected ids that the refreshed window still shows, so the member can retry as is.
  const pruneAfterLoad = useRef(false);
  const onStale = () => {
    pruneAfterLoad.current = true;
    void refresh();
  };
  useEffect(() => {
    if (!pruneAfterLoad.current || loading) return;
    pruneAfterLoad.current = false;
    if (loadError) return;
    const shown = new Set(items.map((i) => i.id));
    const gone = [...selectedIds].filter((id) => !shown.has(id));
    if (gone.length === 0) return;
    dropSelected(gone);
    setPicking((p) => (p?.fromSelection ? { ...p, ids: p.ids.filter((id) => shown.has(id)) } : p));
  }, [loading, loadError, items, selectedIds, dropSelected]);

  async function removeSelected() {
    setSelectError(null);
    setSelectBusy(true);
    try {
      await unlink([...selectedIds]);
      exitSelect();
    } catch (e) {
      setSelectError(e instanceof Error ? e.message : "Could not remove from album");
    } finally {
      setSelectBusy(false);
    }
  }

  const failed = jobs.filter((j) => j.status === "error");
  const pending = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  const current = jobs.find((j) => j.status === "uploading");

  const backToAlbums = () => (router.canGoBack() ? router.back() : router.replace("/albums"));

  if (inAlbum && (albumState.status === "missing" || albumState.status === "error")) {
    const missing = albumState.status === "missing";
    return (
      <View style={[s.screen, s.emptyWrap]}>
        <Stack.Screen options={{ title: "", headerRight: () => null }} />
        <View style={s.empty} accessibilityRole="alert">
          <Text style={s.emptyTitle}>{missing ? "Album not found" : "Couldn't load this album"}</Text>
          <Text style={s.emptyBody}>
            {missing ? "It may have been deleted. Your photos are still in your library." : "Check your connection and try again."}
          </Text>
          {missing ? (
            <Btn title="Back to albums" onPress={backToAlbums} />
          ) : (
            <Btn title="Try again" onPress={() => setAlbumTry((n) => n + 1)} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen} onAccessibilityEscape={selection.active ? exitSelect : undefined}>
      <Stack.Screen
        options={
          inAlbum
            ? {
                title: album?.name ?? "",
                headerRight: () => (selection.active ? null : albumActions.button),
              }
            : {
                headerLeft: () =>
                  selection.active ? null : <Btn compact kind="quiet" title="Sign out" onPress={() => authClient.signOut()} />,
                headerRight: () =>
                  selection.active ? null : (
                    <View style={s.headerActions}>
                      <Btn compact kind="quiet" title="Albums" onPress={() => router.push("/albums")} />
                      <Btn compact title="Upload" onPress={pickAndUpload} />
                    </View>
                  ),
              }
        }
      />

      {!inAlbum && (pending.length > 0 || failed.length > 0) && (
        <View style={s.panel} accessibilityLiveRegion="polite">
          {pending.length > 0 && (
            <View style={{ gap: 8 }}>
              <View style={s.rowBetween}>
                <Text style={s.panelTitle} numberOfLines={1}>
                  {current ? `Uploading ${current.name}` : "Waiting to upload"}
                </Text>
                <Text style={s.panelMeta}>{pending.length} left</Text>
              </View>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round((current?.progress ?? 0) * 100)}%` }]} />
              </View>
            </View>
          )}
          {failed.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={s.failed} accessibilityRole="alert">
                {failed.length === 1 ? `${failed[0].name} didn't upload` : `${failed.length} items didn't upload`}
                {failed[0].error ? ` · ${failed[0].error}` : ""}
              </Text>
              <View style={s.actions}>
                <Btn compact title="Retry" onPress={retryFailed} />
                <Btn compact kind="quiet" title="Dismiss" onPress={() => setAllJobs(jobsRef.current.filter((j) => j.status !== "error"))} />
              </View>
            </View>
          )}
        </View>
      )}

      <View style={s.gallery}>
      <FlatList
        ref={listRef}
        key={cols}
        data={rows}
        extraData={selectionView}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        keyExtractor={(r) => r.key}
        stickyHeaderIndices={headingIndices}
        // Prepending newer items must not shift the view: anchor on the first tile row.
        // At the newest end (no newer pages) new uploads merge above the anchor: autoscroll keeps them visible.
        maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: hasNewer ? undefined : 40 }}
        // Safe at the newest end: loadNewer is a no-op while there is no newer cursor.
        onStartReached={() => void loadNewer()}
        onStartReachedThreshold={0.5}
        onEndReached={() => hasOlder && void loadOlder()}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); }}
        contentContainerStyle={rows.length === 0 ? s.emptyWrap : { paddingBottom: 32 }}
        renderItem={({ item: row }) =>
          row.type === "heading" ? (
            <View style={s.heading}>
              <Text style={s.headingText} accessibilityRole="header">{row.label}</Text>
            </View>
          ) : (
            <View style={[s.tileRow, { paddingRight: railPad }]}>
              {row.items.map((item) => {
                const selected = selectionView.active && selectionView.ids.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={item.kind === "video" ? "Video" : "Photo"}
                    accessibilityState={{ selected }}
                    accessibilityHint={selectionView.active ? undefined : "Long press to select"}
                    accessibilityActions={selectionView.active ? undefined : [{ name: "select", label: "Select" }]}
                    onAccessibilityAction={(e) => e.nativeEvent.actionName === "select" && startSelect(item.id)}
                    style={({ pressed }) => [{ width: size, height: size, backgroundColor: color.page, opacity: pressed ? 0.8 : 1 }]}
                    onPress={() =>
                      selectionView.active
                        ? selection.toggle(item.id)
                        : router.push({
                            pathname: "/viewer",
                            params: albumId ? { id: item.id, url: item.url, kind: item.kind, albumId } : { id: item.id, url: item.url, kind: item.kind },
                          })
                    }
                    onLongPress={() => (selectionView.active ? selection.toggle(item.id) : startSelect(item.id))}
                  >
                    <Image source={item.thumbUrl} style={{ width: size, height: size }} contentFit="cover" transition={150} />
                    {item.kind === "video" && (
                      <View style={s.badge} accessibilityElementsHidden importantForAccessibility="no">
                        <View style={s.play} />
                      </View>
                    )}
                    {selected && <View style={s.selectedFrame} pointerEvents="none" />}
                    {selectionView.active && (
                      <View style={[s.check, selected && s.checkOn]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no">
                        {selected && <View style={s.tick} />}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )
        }
        ListEmptyComponent={
          loading || (inAlbum && albumState.status === "loading") ? (
            <ActivityIndicator color={color.gold} />
          ) : loadError ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>{inAlbum ? "Couldn't load this album" : "Couldn't load your library"}</Text>
              <Text style={s.emptyBody}>Check your connection and try again.</Text>
              <Btn title="Try again" onPress={() => void refresh()} />
            </View>
          ) : inAlbum ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>This album is empty</Text>
              <Text style={s.emptyBody}>Add photos from your library: long-press a photo there, then choose Add to album….</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Nothing here yet</Text>
              <Text style={s.emptyBody}>Upload photos and videos from your phone and everyone in your group will see them.</Text>
              <Btn title="Upload your first photos" onPress={pickAndUpload} />
            </View>
          )
        }
      />
      {items.length > 0 && <TimelineRail buckets={timeline} active={active} onJump={onJump} onJumpNewest={onJumpNewest} />}
      </View>

      {selection.active && (
        <SelectBar
          count={selectedIds.size}
          inAlbum={inAlbum}
          busy={selectBusy}
          error={selectError}
          onCancel={exitSelect}
          onAdd={() => setPicking({ ids: [...selectedIds], fromSelection: true })}
          onRemove={() => void removeSelected()}
        />
      )}
      <AlbumPicker
        visible={!!picking}
        mediaIds={(picking ?? lastPicking.current)?.ids ?? []}
        excludeAlbumId={albumId}
        onStale={onStale}
        onDone={(a, created) => picked(a, created, picking?.ids.length ?? 0)}
        onClose={() => setPicking(null)}
      />
      {albumActions.prompt}
      <Notice notice={notice} onDismiss={hideNotice} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.cloth },
  gallery: { flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  panel: { margin: 12, marginTop: 4, padding: 14, gap: 12, borderRadius: radius.panel, backgroundColor: color.page },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  panelTitle: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: color.ink },
  panelMeta: { fontFamily: font.regular, fontSize: 15, color: color.inkDim, fontVariant: ["tabular-nums"] },
  track: { height: 4, borderRadius: 2, backgroundColor: color.clothLine, overflow: "hidden" },
  fill: { height: 4, backgroundColor: color.gold },
  failed: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.error },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  heading: { backgroundColor: color.cloth, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  headingText: { fontFamily: font.semibold, fontSize: 15, color: color.inkDim },
  tileRow: { flexDirection: "row", gap: GAP, marginBottom: GAP },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 32 },
  empty: { gap: 12, alignItems: "stretch" },
  emptyTitle: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, color: color.ink },
  emptyBody: { fontFamily: font.regular, fontSize: 17, lineHeight: 24, color: color.inkDim, marginBottom: 8 },
  badge: { position: "absolute", right: 6, bottom: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: color.scrim, alignItems: "center", justifyContent: "center" },
  play: {
    marginLeft: 2,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#fff",
  },
  selectedFrame: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: color.gold },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.ink,
    backgroundColor: color.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { borderColor: color.gold, backgroundColor: color.gold },
  // A drawn tick: the bottom and right edges of a narrow box, turned 45°.
  tick: { width: 6, height: 11, marginTop: -2, borderRightWidth: 2, borderBottomWidth: 2, borderColor: color.goldInk, transform: [{ rotate: "45deg" }] },
});
