import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { authClient } from "./api";
import { color, font } from "./theme";

/**
 * The member's account, one round 44pt button (their initial) in the header. Sign out lives
 * behind it with a confirm, so a stray tap in the header can't end the session.
 */
export function AccountButton() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const who = user?.name || user?.email || "your account";
  const initial = who.trim().charAt(0).toUpperCase() || "?";

  function open() {
    Alert.alert("Signed in", user?.email ?? who, [
      { text: "Sign out", style: "destructive", onPress: () => void authClient.signOut() },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account"
      accessibilityHint="Opens sign out"
      onPress={open}
      hitSlop={4}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.75 }]}
    >
      <Text style={s.initial}>{initial}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.page, borderWidth: 1, borderColor: color.clothLine, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: font.bold, fontSize: 16, color: color.ink },
});
