import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ALBUM_MEDIA_BATCH, ALBUM_NAME_MAX, type Album } from "@photovault/shared";
import { addToAlbum, ApiError, createAlbum, listAlbums, PartialCreateError } from "./albums-api";
import { countLabel } from "./count-label";
import { checkAlbumName } from "./name-prompt";
import { color, font, radius } from "./theme";
import { Btn, Field } from "./ui";

/**
 * Turns a failed add/create into words; a 400 means some ids are gone or no longer addable. Each
 * request is all-or-nothing, so with a single batch nothing was added.
 */
function failure(e: unknown, count: number, fallback: string): string {
  if (e instanceof ApiError && e.status === 400 && !(e instanceof PartialCreateError)) {
    const gone = "Some of these items are no longer in your library.";
    return count <= ALBUM_MEDIA_BATCH ? `${gone} Nothing was added.` : gone;
  }
  return e instanceof Error ? e.message : fallback;
}

/**
 * Sheet that adds `mediaIds` to one of the member's albums, or to a new one (the mobile twin of the
 * web picker). Failures show inline and keep it open; success calls `onDone` with the album.
 * `excludeAlbumId` hides the album the member is already in. On a 400 (some ids are gone) it also
 * calls `onStale`, so the caller can refresh the gallery and prune the ids it passes in; the error stays.
 */
export function AlbumPicker({
  mediaIds,
  visible,
  onDone,
  onClose,
  excludeAlbumId,
  onStale,
}: {
  mediaIds: string[];
  visible: boolean;
  /** `created` is true when the album was made here with "New album". */
  onDone: (album: Album, created: boolean) => void;
  onClose: () => void;
  excludeAlbumId?: string;
  onStale?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  // A load answered after a newer one started (or after closing) is dropped.
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

  // Each opening starts fresh and loads the current album list.
  useEffect(() => {
    if (!visible) {
      loadSeq.current++;
      return;
    }
    setAlbums(null);
    setError(null);
    setBusy(false);
    setNaming(false);
    setName("");
    void load();
  }, [visible, load]);

  async function run(action: () => Promise<Album>, created: boolean, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      const album = await action();
      setBusy(false);
      onDone(album, created);
    } catch (e) {
      setError(failure(e, mediaIds.length, fallback));
      setBusy(false);
      // A create can fail after the album exists (later batches): leave the form and show it in the list.
      if (e instanceof PartialCreateError) setNaming(false);
      void load();
      if (e instanceof ApiError && e.status === 400) onStale?.();
    }
  }

  function pick(album: Album) {
    void run(
      async () => {
        await addToAlbum(album.id, mediaIds);
        return album;
      },
      false,
      "Could not add to album",
    );
  }

  function create() {
    if (busy) return;
    const checked = checkAlbumName(name);
    if ("error" in checked) return setError(checked.error);
    void run(() => createAlbum(checked.name, mediaIds), true, "Could not create album");
  }

  const close = () => {
    if (!busy) onClose();
  };
  // Android back: leave the name form first, then the sheet.
  const back = () => {
    if (busy) return;
    if (naming) setNaming(false);
    else onClose();
  };

  // Nothing left to add (e.g. every selected item turned out to be gone): keep the choices off.
  const off = busy || mediaIds.length === 0;
  const shown = albums?.filter((a) => a.id !== excludeAlbumId) ?? null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={back} statusBarTranslucent>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal accessibilityState={{ busy }}>
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header">
              Add {countLabel(mediaIds.length)} to an album
            </Text>
            <Btn compact kind="quiet" title="Close" onPress={onClose} disabled={busy} />
          </View>
          {error && (
            <Text style={s.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          {naming ? (
            <View style={s.form}>
              <Field
                value={name}
                onChangeText={setName}
                placeholder="New album name"
                accessibilityLabel="New album name"
                maxLength={ALBUM_NAME_MAX}
                autoFocus
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={create}
              />
              <View style={s.formActions}>
                <Btn kind="quiet" title="Back" onPress={() => setNaming(false)} disabled={busy} />
                <Btn title="Create album" onPress={create} busy={busy} disabled={off || !name.trim()} />
              </View>
            </View>
          ) : (
            <ScrollView style={s.list} contentContainerStyle={{ gap: 4 }}>
              <Row title="New album…" plus onPress={() => setNaming(true)} disabled={off} />
              {shown?.map((a) => (
                <Row key={a.id} title={a.name} meta={countLabel(a.count)} cover={a.coverThumbUrl} onPress={() => pick(a)} disabled={off} />
              ))}
              {!shown && !loadError && <ActivityIndicator color={color.gold} style={{ marginVertical: 16 }} accessibilityLabel="Loading albums" />}
              {loadError && (
                <View style={s.loadError}>
                  <Text style={s.error} accessibilityRole="alert">
                    Couldn't load your albums.
                  </Text>
                  <Btn compact kind="quiet" title="Try again" onPress={() => void load()} />
                </View>
              )}
            </ScrollView>
          )}
          {busy && !naming && <ActivityIndicator color={color.gold} accessibilityLabel="Adding" />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({
  title,
  meta,
  cover,
  plus,
  onPress,
  disabled,
}: {
  title: string;
  meta?: string;
  cover?: string | null;
  plus?: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [s.row, disabled && { opacity: 0.45 }, pressed && { backgroundColor: color.pageRaise }]}
    >
      <View style={s.cover} accessibilityElementsHidden importantForAccessibility="no">
        {cover ? <Image source={cover} style={s.coverImg} contentFit="cover" /> : null}
        {plus && (
          <>
            <View style={s.plusH} />
            <View style={s.plusV} />
          </>
        )}
      </View>
      <Text style={s.rowTitle} numberOfLines={2}>
        {title}
      </Text>
      {meta && <Text style={s.rowMeta}>{meta}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  sheet: {
    maxHeight: "80%",
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 12,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    backgroundColor: color.page,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontFamily: font.bold, fontSize: 20, lineHeight: 26, color: color.ink },
  error: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.error },
  form: { gap: 12 },
  formActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  list: { flexGrow: 0 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.control },
  cover: { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: color.cloth, overflow: "hidden" },
  coverImg: { width: 44, height: 44 },
  plusH: { position: "absolute", left: 14, top: 21, width: 16, height: 2, backgroundColor: color.ink },
  plusV: { position: "absolute", left: 21, top: 14, width: 2, height: 16, backgroundColor: color.ink },
  rowTitle: { flex: 1, fontFamily: font.semibold, fontSize: 17, lineHeight: 22, color: color.ink },
  rowMeta: { fontFamily: font.regular, fontSize: 15, color: color.inkDim, fontVariant: ["tabular-nums"] },
  loadError: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 8 },
});
