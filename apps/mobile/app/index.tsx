import { useCallback, useState } from "react";
import { Alert, Button, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { MediaItem, MediaPage } from "@photovault/shared";
import { api, authClient } from "../src/api";
import { uploadAsset, type UploadState } from "../src/upload";

const COLS = 3;
const SIZE = Dimensions.get("window").width / COLS;

export default function Gallery() {
  const router = useRouter();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const load = useCallback(async (c: string | null) => {
    const res = await api(`/api/media${c ? `?cursor=${encodeURIComponent(c)}` : ""}`);
    if (!res.ok) return;
    const page: MediaPage = await res.json();
    setItems((prev) => (c ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, []);

  useFocusEffect(useCallback(() => { load(null); }, [load]));

  const patch = (key: string, p: Partial<UploadState>) =>
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...p } : u)));

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow photo library access to upload.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      exif: true,
      quality: 1, // don't re-encode
    });
    if (result.canceled) return;

    const queue = result.assets.map((a, i) => ({
      asset: a,
      state: { key: `${Date.now()}-${i}`, name: a.fileName ?? `item ${i + 1}`, progress: 0, status: "queued" } as UploadState,
    }));
    setUploads((prev) => [...prev, ...queue.map((q) => q.state)]);

    // Sequential to keep memory/bandwidth predictable; raise to 2-3 for faster batches.
    for (const { asset, state } of queue) {
      patch(state.key, { status: "uploading" });
      try {
        await uploadAsset(asset, (p) => patch(state.key, { progress: p }));
        patch(state.key, { status: "done", progress: 1 });
      } catch (e) {
        patch(state.key, { status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }
    load(null);
  }

  const active = uploads.filter((u) => u.status === "queued" || u.status === "uploading").length;
  const failed = uploads.filter((u) => u.status === "error");

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        <Button title="Upload" onPress={pickAndUpload} />
        <Button title="Sign out" onPress={() => authClient.signOut()} />
      </View>
      {active > 0 && <Text style={s.note}>Uploading… {active} remaining</Text>}
      {failed.length > 0 && <Text style={[s.note, { color: "crimson" }]}>{failed.length} failed: {failed[0].error}</Text>}
      <FlatList
        data={items}
        numColumns={COLS}
        keyExtractor={(i) => i.id}
        onEndReached={() => cursor && load(cursor)}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: "/viewer", params: { id: item.id, url: item.url, kind: item.kind } })}>
            <Image source={item.thumbUrl} style={{ width: SIZE, height: SIZE }} contentFit="cover" />
            {item.kind === "video" && <Text style={s.badge}>▶</Text>}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={s.note}>No media yet. Tap Upload.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between", padding: 8 },
  note: { padding: 8, textAlign: "center" },
  badge: { position: "absolute", right: 6, bottom: 6, color: "#fff", backgroundColor: "#000a", paddingHorizontal: 5, borderRadius: 4, overflow: "hidden" },
});
