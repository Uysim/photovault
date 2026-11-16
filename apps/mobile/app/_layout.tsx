import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { authClient } from "../src/api";

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    const onSignIn = segments[0] === "sign-in";
    if (!session && !onSignIn) router.replace("/sign-in");
    else if (session && onSignIn) router.replace("/");
  }, [session, isPending, segments, router]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "PhotoVault" }} />
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
      <Stack.Screen name="viewer" options={{ title: "", presentation: "modal" }} />
    </Stack>
  );
}
