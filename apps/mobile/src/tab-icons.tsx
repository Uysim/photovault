import { type ColorValue, StyleSheet, View } from "react-native";

// Drawn, not glyphs (the design system forbids text icons): a grid of tiles for the library,
// two stacked frames for albums. 24pt box, tinted by the tab bar.
export function LibraryIcon({ color }: { color: ColorValue }) {
  return (
    <View style={s.box}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[s.tile, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

export function AlbumsIcon({ color }: { color: ColorValue }) {
  return (
    <View style={s.box}>
      <View style={[s.back, { borderColor: color }]} />
      <View style={[s.front, { borderColor: color }]} />
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: 24, height: 24, flexDirection: "row", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 3 },
  tile: { width: 9, height: 9, borderRadius: 2 },
  back: { position: "absolute", top: 1, left: 5, width: 17, height: 17, borderRadius: 3, borderWidth: 2, opacity: 0.55 },
  front: { position: "absolute", top: 6, left: 1, width: 17, height: 17, borderRadius: 3, borderWidth: 2, backgroundColor: "transparent" },
});
