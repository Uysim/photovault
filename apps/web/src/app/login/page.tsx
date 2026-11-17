"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name: String(f.get("name")),
            // extra field consumed by the invite check in lib/auth.ts
            inviteCode: String(f.get("inviteCode") ?? ""),
          } as Parameters<typeof authClient.signUp.email>[0]);
    if (res.error) setError(res.error.message ?? "Failed");
    else router.push("/");
  }

  return (
    <>
      <h1>{mode === "in" ? "Sign in" : "Create account"}</h1>
      <form onSubmit={onSubmit}>
        {mode === "up" && <input name="name" placeholder="Name" required />}
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" minLength={8} required />
        {mode === "up" && <input name="inviteCode" placeholder="Invite code" />}
        <button type="submit" className="primary">{mode === "in" ? "Sign in" : "Sign up"}</button>
        {error && <p className="error">{error}</p>}
      </form>
      <p>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Have an invite? Sign up" : "Back to sign in"}
        </button>
      </p>
    </>
  );
}
