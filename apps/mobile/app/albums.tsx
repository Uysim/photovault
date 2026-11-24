import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import type { Album } from "@photovault/shared";
import { createAlbum, listAlbums } from "../src/albums-api";
import { countLabel } from "../src/count-label";
import { NamePrompt } from "../src/name-prompt";
import { color, font, radius } from "../src/theme";
import { Btn } from "../src/ui";

const GAP = 12;
const PAD = 12;

function columnsFor(width: number) {
  return width >= 900 ? 5 : width >= 600 ? 4 : 2;
}

export default function AlbumsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = columnsFor(width);
  const size = (width - PAD * 2 - GAP * (cols - 1)) / cols;

  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [naming, setNaming] = useState(false);
  // Only the latest load may land (focus, pull-to-refresh and Try again can overlap).
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoadError(false);
    try {
      const list = await listAlbums();
      if (seq === loadSeq.current) setAlbums(list);
    } catch {
      if (seq === loadSeq.current) setLoadError(true);
    }
  }, []);

  // Every visit reloads: names, counts and covers change in the album view and the picker.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function create(name: string) {
    const album = await createAlbum(name);
    setNaming(false);
    router.push({ pathname: "/album/[id]", params: { id: album.id } });
  }

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerRight: () => <Btn compact title="New album" onPress={() => setNaming(true)} /> }} />
      <FlatList
        key={cols}
        data={albums ?? []}
        numColumns={cols}
        keyExtractor={(a) => a.id}
        columnWrapperStyle={cols > 1 ? { gap: GAP } : undefined}
        contentContainerStyle={albums && albums.length > 0 ? s.grid : s.emptyWrap}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }}
        renderItem={({ item: a }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${a.name}, ${countLabel(a.count)}`}
            onPress={() => router.push({ pathname: "/album/[id]", params: { id: a.id } })}
            style={({ pressed }) => [{ width: size, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[s.cover, { width: size, height: size }]}>
              {a.coverThumbUrl && <Image source={a.coverThumbUrl} style={{ width: size, height: size }} contentFit="cover" transition={150} />}
            </View>
            <Text style={s.name} numberOfLines={2}>
              {a.name}
            </Text>
            <Text style={s.count}>{countLabel(a.count)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          loadError ? (
            <View style={s.empty} accessibilityRole="alert">
              <Text style={s.emptyTitle}>Couldn't load your albums</Text>
              <Text style={s.emptyBody}>Check your connection and try again.</Text>
              <Btn title="Try again" onPress={() => void load()} />
            </View>
          ) : !albums ? (
            <ActivityIndicator color={color.gold} />
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No albums yet</Text>
              <Text style={s.emptyBody}>Start one with New album, then add photos from your library.</Text>
              <Btn title="New album" onPress={() => setNaming(true)} />
            </View>
          )
        }
      />
      {/* A failed reload while albums are showing keeps them, with a quiet way to retry. */}
      {loadError && albums && albums.length > 0 && (
        <View style={s.reloadError}>
          <Text style={s.errorText} accessibilityRole="alert">
            Couldn't refresh your albums.
          </Text>
          <Btn compact kind="quiet" title="Try again" onPress={() => void load()} />
        </View>
      )}
      <NamePrompt visible={naming} title="New album" submitLabel="Create album" onSubmit={create} onCancel={() => setNaming(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.cloth },
  grid: { padding: PAD, gap: 20, paddingBottom: 32 },
  cover: { borderRadius: radius.tile, backgroundColor: color.page, overflow: "hidden" },
  name: { marginTop: 8, fontFamily: font.semibold, fontSize: 16, lineHeight: 21, color: color.ink },
  count: { marginTop: 2, fontFamily: font.regular, fontSize: 15, color: color.inkDim, fontVariant: ["tabular-nums"] },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 32 },
  empty: { gap: 12, alignItems: "stretch" },
  emptyTitle: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, color: color.ink },
  emptyBody: { fontFamily: font.regular, fontSize: 17, lineHeight: 24, color: color.inkDim, marginBottom: 8 },
  reloadError: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 12, backgroundColor: color.page },
  errorText: { flexShrink: 1, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.error },
});
