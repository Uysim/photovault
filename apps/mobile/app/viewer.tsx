import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { api } from "../src/api";
import { emitDeleted } from "../src/gallery-events";
import { color } from "../src/theme";
import { Btn } from "../src/ui";

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return <VideoView player={player} style={s.media} fullscreenOptions={{ enable: true }} />;
}

export default function Viewer() {
  const { id, url, kind } = useLocalSearchParams<{ id: string; url: string; kind: string }>();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

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

  return (
    <View style={s.c}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: color.viewer },
          headerLeft: () => <Btn compact kind="quiet" title="Close" onPress={() => router.back()} />,
          headerRight: () => <Btn compact kind="danger" title="Delete" busy={deleting} onPress={confirmDelete} />,
        }}
      />
      {kind === "video" ? (
        <Video url={url} />
      ) : (
        <Image source={url} style={s.media} contentFit="contain" transition={150} accessibilityLabel="Photo" />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: color.viewer, justifyContent: "center" },
  media: { flex: 1 },
});
