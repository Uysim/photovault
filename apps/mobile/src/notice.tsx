import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius } from "./theme";
import { Btn } from "./ui";

export type NoticeContent = { text: string; action?: { label: string; onPress: () => void } };

const NOTICE_MS = 5000;

/** A brief confirmation that goes away on its own; showing a new one replaces the old. */
export function useNotice() {
  const [notice, setNotice] = useState<(NoticeContent & { key: number }) | null>(null);
  const show = useCallback((n: NoticeContent) => {
    setNotice({ ...n, key: Date.now() });
    // iOS has no live regions: announce it so VoiceOver users hear the confirmation too.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(n.text);
  }, []);
  const hide = useCallback(() => setNotice(null), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  return { notice, show, hide };
}

/** Floats over the bottom of the screen; render it last so it sits above the content. */
/** `bottom` overrides the default spot (just above the bottom safe area), e.g. to sit above a bar. */
export function Notice({ notice, onDismiss, bottom }: { notice: NoticeContent | null; onDismiss: () => void; bottom?: number }) {
  const insets = useSafeAreaInsets();
  if (!notice) return null;
  const { action } = notice;
  return (
    <View style={[s.slot, { bottom: bottom ?? 12 + insets.bottom }]} pointerEvents="box-none">
      <View style={s.notice} accessibilityLiveRegion="polite">
        <Text style={s.text}>{notice.text}</Text>
        {action && (
          <Btn
            compact
            kind="quiet"
            title={action.label}
            onPress={() => {
              onDismiss();
              action.onPress();
            }}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  slot: { position: "absolute", left: 12, right: 12, alignItems: "center" },
  notice: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    maxWidth: 520,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color.clothLine,
    backgroundColor: color.pageRaise,
  },
  text: { flexShrink: 1, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.ink },
});
