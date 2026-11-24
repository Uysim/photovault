import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ALBUM_NAME_MAX } from "@photovault/shared";
import { color, font, radius } from "./theme";
import { Btn, Field } from "./ui";

/** Trimmed album name, or an error to show. The API takes 1–ALBUM_NAME_MAX characters after trimming. */
export function checkAlbumName(raw: string): { name: string } | { error: string } {
  const name = raw.trim();
  if (!name) return { error: "Give the album a name." };
  if (name.length > ALBUM_NAME_MAX) return { error: `Album names can be up to ${ALBUM_NAME_MAX} characters.` };
  return { name };
}

/**
 * One cross-platform "type a name" dialog (Alert.prompt is iOS-only), used for New album and
 * Rename. `onSubmit` gets the trimmed name; if it throws, its message shows and the dialog stays.
 */
export function NamePrompt({
  visible,
  title,
  initial = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Each opening starts from `initial` with no leftover error.
  useEffect(() => {
    if (!visible) return;
    setValue(initial);
    setError(null);
    setBusy(false);
  }, [visible, initial]);

  async function submit() {
    if (busy) return;
    const checked = checkAlbumName(value);
    if ("error" in checked) return setError(checked.error);
    setError(null);
    setBusy(true);
    try {
      await onSubmit(checked.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy(false);
  }

  const cancel = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel} statusBarTranslucent>
      {/* "padding" on both platforms: it pads by the measured keyboard overlap, so it is right whether
          or not the window resizes (Android edge-to-edge Modals may not). KAV sets its own
          paddingBottom, so the spacing lives on the inner view. */}
      <KeyboardAvoidingView style={s.fill} behavior="padding" keyboardVerticalOffset={0}>
        <View style={[s.backdrop, { paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Cancel" accessibilityRole="button" />
          <View style={s.panel} accessibilityViewIsModal>
            {/* Scrolls when the keyboard leaves less room than the panel needs. */}
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
              <Text style={s.title} accessibilityRole="header">
                {title}
              </Text>
              <Field
                value={value}
                onChangeText={setValue}
                placeholder="Album name"
                accessibilityLabel="Album name"
                maxLength={ALBUM_NAME_MAX}
                autoFocus
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
              />
              {error && (
                <Text style={s.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}
              <View style={s.actions}>
                <Btn kind="quiet" title="Cancel" onPress={cancel} disabled={busy} />
                <Btn title={submitLabel} onPress={() => void submit()} busy={busy} disabled={!value.trim()} />
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, justifyContent: "center", paddingHorizontal: 24, backgroundColor: color.scrim },
  panel: { flexShrink: 1, width: "100%", maxWidth: 480, alignSelf: "center", borderRadius: radius.panel, backgroundColor: color.page },
  content: { padding: 20, gap: 14 },
  title: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, color: color.ink },
  error: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.error },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
});
