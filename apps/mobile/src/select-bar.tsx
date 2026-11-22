import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { countLabel } from "./count-label";
import { color, font } from "./theme";
import { Btn } from "./ui";

/**
 * The select-mode action bar, docked under the grid while select mode is on (the header's own
 * actions are hidden meanwhile). Cancel is always there so the way out is always visible.
 */
export function SelectBar({
  count,
  inAlbum,
  busy,
  error,
  onCancel,
  onAdd,
  onRemove,
}: {
  count: number;
  inAlbum: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const insets = useSafeAreaInsets();
  const none = count === 0;
  return (
    <View style={[s.bar, { paddingBottom: 12 + insets.bottom }]} accessibilityLabel="Selection">
      <View style={s.top}>
        <Text style={s.count} accessibilityLiveRegion="polite">
          {none ? "Choose photos and videos" : `${countLabel(count)} selected`}
        </Text>
        <Btn compact kind="quiet" title="Cancel" onPress={onCancel} disabled={busy} />
      </View>
      {error && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <View style={s.actions}>
        {inAlbum && <Btn title="Remove from album" onPress={onRemove} disabled={none} busy={busy} style={s.grow} />}
        <Btn
          title="Add to album…"
          kind={inAlbum ? "quiet" : "primary"}
          onPress={onAdd}
          disabled={none || busy}
          style={s.grow}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingTop: 10, gap: 8, backgroundColor: color.page, borderTopWidth: 1, borderTopColor: color.clothLine },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  count: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: color.ink, fontVariant: ["tabular-nums"] },
  error: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.error },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  grow: { flexGrow: 1 },
});
