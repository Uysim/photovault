import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, type ViewStyle } from "react-native";
import { color, font, radius } from "./theme";

type BtnProps = {
  title: string;
  onPress: () => void;
  kind?: "primary" | "quiet" | "danger";
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean; // header-sized
  style?: ViewStyle;
};

// One button, three voices. 48pt tall (44 compact: header pills) keeps targets honest.
export function Btn({ title, onPress, kind = "primary", busy, disabled, compact, style }: BtnProps) {
  const off = disabled || busy;
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      hitSlop={compact ? 6 : 0}
      style={({ pressed }) => [
        s.btn,
        compact && s.compact,
        primary && { backgroundColor: color.gold },
        !primary && { backgroundColor: "transparent" },
        off && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? color.goldInk : color.ink} />
      ) : (
        <Text
          style={[
            s.btnText,
            { color: primary ? color.goldInk : kind === "danger" ? color.error : color.ink },
            !primary && !compact && { fontFamily: font.semibold },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ inputRef, ...props }: TextInputProps & { inputRef?: (r: { focus(): void } | null) => void }) {
  return (
    <TextInput
      ref={inputRef}
      placeholderTextColor={color.inkDim}
      selectionColor={color.gold}
      cursorColor={color.gold}
      keyboardAppearance="dark"
      {...props}
      style={[s.field, props.style]}
    />
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  compact: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22 },
  btnText: { fontFamily: font.bold, fontSize: 16 },
  field: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.clothLine,
    backgroundColor: color.page,
    color: color.ink,
    fontFamily: font.regular,
    fontSize: 17,
  },
});
