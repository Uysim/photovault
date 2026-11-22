import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import type { Album } from "@photovault/shared";
import { deleteAlbum, renameAlbum } from "./albums-api";
import { NamePrompt } from "./name-prompt";
import { Btn } from "./ui";

/**
 * Rename and Delete album for the album view's header, behind one "Edit" button (the header is
 * too narrow for both). Neither touches the photos. Render `prompt` in the screen body.
 */
export function useAlbumActions(album: Album | null, onRenamed: (album: Album) => void) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/albums");
  }

  function confirmDelete(a: Album) {
    Alert.alert("Delete album?", `Delete the album “${a.name}”? Photos stay in your library.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete album",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAlbum(a.id);
            return leave();
          } catch (e) {
            setDeleting(false);
            Alert.alert("Couldn't delete album", e instanceof Error ? e.message : "Check your connection and try again.");
          }
        },
      },
    ]);
  }

  function openMenu() {
    if (!album) return;
    Alert.alert(album.name, undefined, [
      { text: "Rename", onPress: () => setRenaming(true) },
      { text: "Delete album", style: "destructive", onPress: () => confirmDelete(album) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const button = <Btn compact kind="quiet" title="Edit" onPress={openMenu} busy={deleting} disabled={!album} />;

  const prompt = album && (
    <NamePrompt
      visible={renaming}
      title="Rename album"
      initial={album.name}
      submitLabel="Rename"
      onCancel={() => setRenaming(false)}
      onSubmit={async (name) => {
        if (name !== album.name) onRenamed(await renameAlbum(album.id, name));
        setRenaming(false);
      }}
    />
  );

  return { button, prompt };
}
