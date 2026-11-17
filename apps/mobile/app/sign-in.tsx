import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient } from "../src/api";
import { color, font } from "../src/theme";
import { Btn, Field } from "../src/ui";

type Focusable = { focus(): void } | null;

export default function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<Focusable>(null);
  const passwordRef = useRef<Focusable>(null);
  const inviteRef = useRef<Focusable>(null);

  const signUp = mode === "up";
  const ready = !!(email.trim() && password && (!signUp || (name.trim() && inviteCode.trim())));

  async function submit() {
    if (busy || !ready) return;
    setError(null);
    setBusy(true);
    try {
      const res = signUp
        ? await authClient.signUp.email({
            email: email.trim(),
            password,
            name: name.trim(),
            inviteCode: inviteCode.trim(),
          } as Parameters<typeof authClient.signUp.email>[0])
        : await authClient.signIn.email({ email: email.trim(), password });
      if (res.error) {
        setError(res.error.message ?? (signUp ? "Couldn't sign up. Check your invite code." : "Couldn't sign in. Check your email and password."));
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.c} keyboardShouldPersistTaps="handled">
          <View style={s.head}>
            <Text style={s.mark} accessibilityRole="header">PhotoVault</Text>
            <Text style={s.tag}>{signUp ? "Join with an invite from your group." : "Your group's private photos and videos."}</Text>
          </View>

          <View style={s.form}>
            {signUp && (
              <Field
                placeholder="Name"
                accessibilityLabel="Name"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                value={name}
                onChangeText={setName}
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            )}
            <Field
              inputRef={(r) => { emailRef.current = r; }}
              placeholder="Email"
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              inputRef={(r) => { passwordRef.current = r; }}
              placeholder="Password"
              accessibilityLabel="Password"
              secureTextEntry
              autoComplete={signUp ? "new-password" : "current-password"}
              textContentType={signUp ? "newPassword" : "password"}
              returnKeyType={signUp ? "next" : "go"}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => (signUp ? inviteRef.current?.focus() : submit())}
            />
            {signUp && (
              <Field
                inputRef={(r) => { inviteRef.current = r; }}
                placeholder="Invite code"
                accessibilityLabel="Invite code"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                value={inviteCode}
                onChangeText={setInviteCode}
                onSubmitEditing={submit}
              />
            )}

            {error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}

            <Btn title={signUp ? "Create account" : "Sign in"} onPress={submit} busy={busy} disabled={!ready} style={{ marginTop: 6 }} />
            <Btn
              title={signUp ? "I already have an account" : "Have an invite? Create account"}
              kind="quiet"
              disabled={busy}
              onPress={() => { setError(null); setMode(signUp ? "in" : "up"); }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.cloth },
  c: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32, gap: 36, maxWidth: 480, width: "100%", alignSelf: "center" },
  head: { gap: 8 },
  mark: { fontFamily: font.bold, fontSize: 40, lineHeight: 44, color: color.ink, letterSpacing: -0.5 },
  tag: { fontFamily: font.regular, fontSize: 17, lineHeight: 24, color: color.inkDim },
  form: { gap: 12 },
  error: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.error },
});
