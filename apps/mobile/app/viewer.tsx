import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import type { Album } from "@photovault/shared";
import { api } from "../src/api";
import { AlbumPicker } from "../src/album-picker";
import { removeFromAlbum } from "../src/albums-api";
import { countLabel } from "../src/count-label";
import { emitDeleted, emitGalleryStale, emitRemovedFromAlbum } from "../src/gallery-events";
import { Notice, useNotice } from "../src/notice";
import { color } from "../src/theme";
import { Btn } from "../src/ui";

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return <VideoView player={player} style={s.media} fullscreenOptions={{ enable: true }} />;
}

export default function Viewer() {
  // `albumId` is set when opened from an album view: then the primary action is Remove from album.
  const { id, url, kind, albumId } = useLocalSearchParams<{ id: string; url: string; kind: string; albumId?: string }>();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [picking, setPicking] = useState(false);
  const { notice, show: showNotice, hide: hideNotice } = useNotice();

  function confirmDelete() {
    Alert.alert("Delete permanently?", "This removes it from storage and can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await api(`/api/media/${id}`, { method: "DELETE" });
            if (res.ok) {
              emitDeleted(id);
              return router.back();
            }
          } catch {}
          setDeleting(false);
          Alert.alert("Couldn't delete", "Check your connection and try again.");
        },
      },
    ]);
  }

  // Unlinks only: the photo stays in the library (Delete is the permanent one).
  async function removeFromThisAlbum() {
    if (!albumId) return;
    setRemoving(true);
    try {
      await removeFromAlbum(albumId, [id]);
    } catch (e) {
      setRemoving(false);
      return Alert.alert("Couldn't remove from album", e instanceof Error ? e.message : "Check your connection and try again.");
    }
    emitRemovedFromAlbum(albumId, id);
    router.back();
  }

  function picked(album: Album, created: boolean) {
    setPicking(false);
    showNotice({
      text: created ? `Created “${album.name}” with ${countLabel(1)}.` : `Added ${countLabel(1)} to “${album.name}”.`,
      action: {
        label: "Open album",
        onPress: () => {
          router.back();
          router.push({ pathname: "/album/[id]", params: { id: album.id } });
        },
      },
    });
  }

  const busy = deleting || removing;

  return (
    <View style={s.c}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: color.viewer },
          headerLeft: () => <Btn compact kind="quiet" title="Close" onPress={() => router.back()} />,
          headerRight: () => (
            <View style={s.headerActions}>
              {albumId ? (
                <Btn compact title="Remove from album" busy={removing} disabled={deleting} onPress={() => void removeFromThisAlbum()} />
              ) : (
                <Btn compact kind="quiet" title="Add to album…" disabled={busy} onPress={() => setPicking(true)} />
              )}
              <Btn compact kind="danger" title="Delete" busy={deleting} disabled={removing} onPress={confirmDelete} />
            </View>
          ),
        }}
      />
      {kind === "video" ? (
        <Video url={url} />
      ) : (
        <Image source={url} style={s.media} contentFit="contain" transition={150} accessibilityLabel="Photo" />
      )}
      {!albumId && (
        <AlbumPicker
          visible={picking}
          mediaIds={[id]}
          onStale={emitGalleryStale}
          onDone={picked}
          onClose={() => setPicking(false)}
        />
      )}
      <Notice notice={notice} onDismiss={hideNotice} />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: color.viewer, justifyContent: "center" },
  media: { flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
});
