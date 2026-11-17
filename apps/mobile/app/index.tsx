import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { MediaItem, MediaPage } from "@photovault/shared";
import { api, authClient } from "../src/api";
import { uploadAsset, type UploadState } from "../src/upload";
import { color, font, radius } from "../src/theme";
import { Btn } from "../src/ui";

type ImagePickerAsset = ImagePicker.ImagePickerAsset;
type Job = UploadState & { asset: ImagePickerAsset };

const GAP = 3;
const MAX_ROWS = 3;

function columnsFor(width: number) {
  return width >= 900 ? 6 : width >= 600 ? 5 : 3;
}

export default function Gallery() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = columnsFor(width);
  const size = (width - GAP * (cols - 1)) / cols;

  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef<Job[]>([]);
  const running = useRef(false);

  const load = useCallback(async (cur: string | null) => {
    try {
      const res = await api(`/api/media${cur ? `?cursor=${encodeURIComponent(cur)}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const page: MediaPage = await res.json();
      setItems((prev) => (cur ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(null); }, [load]));

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
      load(null);
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

  const failed = jobs.filter((j) => j.status === "error");
  const pending = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  const current = jobs.find((j) => j.status === "uploading");

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          headerLeft: () => <Btn compact kind="quiet" title="Sign out" onPress={() => authClient.signOut()} />,
          headerRight: () => <Btn compact title="Upload" onPress={pickAndUpload} />,
        }}
      />

      {(pending.length > 0 || failed.length > 0) && (
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

      <FlatList
        key={cols}
        data={items}
        numColumns={cols}
        keyExtractor={(i) => i.id}
        columnWrapperStyle={cols > 1 ? { gap: GAP } : undefined}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        onEndReached={() => cursor && load(cursor)}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); load(null); }}
        contentContainerStyle={items.length === 0 ? s.emptyWrap : { paddingBottom: 32 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={item.kind === "video" ? "Video" : "Photo"}
            style={({ pressed }) => [{ width: size, height: size, backgroundColor: color.page, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push({ pathname: "/viewer", params: { id: item.id, url: item.url, kind: item.kind } })}
          >
            <Image source={item.thumbUrl} style={{ width: size, height: size }} contentFit="cover" transition={150} />
            {item.kind === "video" && (
              <View style={s.badge} accessibilityElementsHidden importantForAccessibility="no">
                <View style={s.play} />
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={color.gold} />
          ) : loadError ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Couldn't load your library</Text>
              <Text style={s.emptyBody}>Check your connection and try again.</Text>
              <Btn title="Try again" onPress={() => { setLoading(true); load(null); }} />
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
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.cloth },
  panel: { margin: 12, marginTop: 4, padding: 14, gap: 12, borderRadius: radius.panel, backgroundColor: color.page },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  panelTitle: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: color.ink },
  panelMeta: { fontFamily: font.regular, fontSize: 15, color: color.inkDim, fontVariant: ["tabular-nums"] },
  track: { height: 4, borderRadius: 2, backgroundColor: color.clothLine, overflow: "hidden" },
  fill: { height: 4, backgroundColor: color.gold },
  failed: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.error },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
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
});
