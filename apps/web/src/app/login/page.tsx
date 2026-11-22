"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "in" | "up";

export default function LoginPage() {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<Mode>("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const signingUp = mode === "up";
  const id = (name: string) => `${uid}-${name}`;

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setShowPw(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const password = String(f.get("password"));
    setError(null);
    setPending(true);
    try {
      const res = signingUp
        ? await authClient.signUp.email({
            email,
            password,
            name: String(f.get("name")).trim(),
            // extra field consumed by the invite check in lib/auth.ts
            inviteCode: String(f.get("inviteCode") ?? "").trim(),
          } as Parameters<typeof authClient.signUp.email>[0])
        : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? (signingUp ? "Couldn't create the account. Try again." : "Couldn't sign in. Check your email and password."));
        setPending(false);
        return;
      }
      router.push("/");
    } catch {
      setError("Couldn't reach PhotoVault. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-page">
        <p className="auth-mark">PhotoVault</p>

        <div className="auth-switch" role="group" aria-label="Account">
          <button type="button" aria-pressed={!signingUp} onClick={() => switchMode("in")}>
            Sign in
          </button>
          <button type="button" aria-pressed={signingUp} onClick={() => switchMode("up")}>
            Create account
          </button>
        </div>

        <h1 className="auth-title">{signingUp ? "Join the album" : "Welcome back"}</h1>
        <p className="auth-sub">
          {signingUp
            ? "PhotoVault is invite-only. Use the code your admin sent you."
            : "Sign in to see what the group has added."}
        </p>

        <form className="auth-form" onSubmit={onSubmit} aria-busy={pending}>
          {signingUp && (
            <div className="field">
              <label htmlFor={id("name")}>Name</label>
              <input id={id("name")} name="name" autoComplete="name" required />
            </div>
          )}
          <div className="field">
            <label htmlFor={id("email")}>Email</label>
            <input id={id("email")} name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          <div className="field">
            <label htmlFor={id("password")}>Password</label>
            <div className="pw">
              <input
                id={id("password")}
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete={signingUp ? "new-password" : "current-password"}
                minLength={8}
                required
                aria-describedby={signingUp ? id("pw-hint") : undefined}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            {signingUp && (
              <p className="hint" id={id("pw-hint")}>
                At least 8 characters.
              </p>
            )}
          </div>
          {signingUp && (
            <div className="field">
              <label htmlFor={id("invite")}>Invite code</label>
              <input
                id={id("invite")}
                name="inviteCode"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={id("invite-hint")}
              />
              <p className="hint" id={id("invite-hint")}>
                Not needed for the admin account.
              </p>
            </div>
          )}

          <div className="auth-error" role="alert">
            {error}
          </div>

          <button type="submit" className="primary auth-submit" disabled={pending}>
            {pending ? (signingUp ? "Creating account…" : "Signing in…") : signingUp ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
