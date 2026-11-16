import { Alert, Button, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { api } from "../src/api";

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return <VideoView player={player} style={s.media} fullscreenOptions={{ enable: true }} />;
}

export default function Viewer() {
  const { id, url, kind } = useLocalSearchParams<{ id: string; url: string; kind: string }>();
  const router = useRouter();

  function confirmDelete() {
    Alert.alert("Delete permanently?", "This removes it from storage.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = await api(`/api/media/${id}`, { method: "DELETE" });
          if (res.ok) router.back();
          else Alert.alert("Delete failed");
        },
      },
    ]);
  }

  return (
    <View style={s.c}>
      {kind === "video" ? <Video url={url} /> : <Image source={url} style={s.media} contentFit="contain" />}
      <Button title="Delete" color="crimson" onPress={confirmDelete} />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  media: { flex: 1 },
});
