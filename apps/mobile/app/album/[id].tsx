import { useLocalSearchParams } from "expo-router";
import { GalleryScreen } from "../../src/gallery-screen";

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Keyed so a different album always mounts a fresh screen (no previous album's items or rail).
  return <GalleryScreen key={id} albumId={id} />;
}
