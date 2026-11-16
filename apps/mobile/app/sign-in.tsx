import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { authClient } from "../src/api";

export default function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const res =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name, inviteCode } as Parameters<typeof authClient.signUp.email>[0]);
    if (res.error) setError(res.error.message ?? "Failed");
  }

  return (
    <View style={s.c}>
      {mode === "up" && <TextInput style={s.i} placeholder="Name" value={name} onChangeText={setName} />}
      <TextInput style={s.i} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.i} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {mode === "up" && <TextInput style={s.i} placeholder="Invite code" autoCapitalize="none" value={inviteCode} onChangeText={setInviteCode} />}
      <Button title={mode === "in" ? "Sign in" : "Sign up"} onPress={submit} />
      <Button title={mode === "in" ? "Have an invite? Sign up" : "Back to sign in"} onPress={() => setMode(mode === "in" ? "up" : "in")} />
      {error && <Text style={{ color: "crimson" }}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, padding: 16, gap: 10, justifyContent: "center" },
  i: { borderWidth: 1, borderColor: "#8886", borderRadius: 8, padding: 12 },
});
