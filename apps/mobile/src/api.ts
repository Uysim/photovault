import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [expoClient({ scheme: "photovault", storagePrefix: "photovault", storage: SecureStore })],
});

/** fetch against our API with the Better Auth session cookie attached. */
export async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookie = await authClient.getCookie();
  if (cookie) headers.set("Cookie", cookie);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: "omit" });
}
