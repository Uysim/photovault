import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, useFonts } from "@expo-google-fonts/hanken-grotesk";
import { authClient } from "../src/api";
import { color, font } from "../src/theme";

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const [fontsLoaded] = useFonts({ HankenGrotesk_400Regular, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold });
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    const onSignIn = segments[0] === "sign-in";
    if (!session && !onSignIn) router.replace("/sign-in");
    else if (session && onSignIn) router.replace("/");
  }, [session, isPending, segments, router]);

  // Hold on the cloth until fonts and session are known: no flash of the wrong screen.
  if (isPending || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: color.cloth, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.cloth },
          headerTintColor: color.ink,
          headerTitleStyle: { fontFamily: font.bold, fontSize: 20, color: color.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.cloth },
        }}
      >
        <Stack.Screen name="index" options={{ title: "PhotoVault" }} />
        <Stack.Screen name="albums" options={{ title: "Albums" }} />
        <Stack.Screen name="album/[id]" options={{ title: "" }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen
          name="viewer"
          options={{ title: "", presentation: "modal", contentStyle: { backgroundColor: color.viewer } }}
        />
      </Stack>
    </>
  );
}
