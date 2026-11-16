"use client";
import { useState } from "react";

export default function Admin() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const res = await fetch("/api/admin/invites", { method: "POST" });
    if (res.ok) setCode((await res.json()).code);
    else setError("Admins only");
  }

  return (
    <>
      <h1>Invites</h1>
      <button onClick={create}>Create invite (valid 7 days)</button>
      {code && <p>Code: <code>{code}</code></p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p><a href="/">Back</a></p>
    </>
  );
}
