// Dev-only: seeds ~400 ready photo rows for a user to exercise the gallery timeline.
// Usage: pnpm dlx tsx --env-file=apps/web/.env apps/web/scripts/seed-timeline.ts <user-email> [--clean]
// Refuses to run unless DATABASE_URL points at a local Postgres.
import { and, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";

const PREFIX = "seed-";

function localUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  // pg lets ?host= / ?hostaddr= override the URL hostname, so they would bypass the check below.
  for (const key of parsed.searchParams.keys()) {
    if (["host", "hostaddr"].includes(key.toLowerCase())) {
      throw new Error(`Refusing to seed: DATABASE_URL must not set "${key}" as a query parameter.`);
    }
  }
  const host = parsed.hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
    throw new Error(`Refusing to seed: DATABASE_URL host "${host}" is not local (localhost / 127.0.0.1 / [::1]).`);
  }
  return url;
}

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes("--clean");
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) throw new Error("Usage: seed-timeline.ts <user-email> [--clean]");

  const db = drizzle(localUrl(), { schema });
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (!u) throw new Error(`No user with email ${email}`);
  const m = schema.media;

  if (clean) {
    const del = await db.delete(m).where(and(eq(m.userId, u.id), like(m.id, `${PREFIX}%`))).returning({ id: m.id });
    console.log(`Deleted ${del.length} seed rows`);
    return;
  }

  // Deterministic pseudo-random so reruns produce the same layout.
  let s = 42;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);

  const times: Date[] = [];
  const start = Date.UTC(2019, 0, 1);
  const end = Date.UTC(2024, 11, 31);
  // ~260 scattered rows, skipping 2020-03 so it holds only the lone photo.
  while (times.length < 260) {
    const t = new Date(start + rnd() * (end - start));
    if (t.getUTCFullYear() === 2020 && t.getUTCMonth() === 2) continue;
    times.push(t);
  }
  const burst = new Date("2023-07-15T10:00:00.000Z");
  for (let i = 0; i < 70; i++) times.push(burst); // identical takenAt
  times.push(new Date("2024-12-31T17:30:00.000Z"), new Date("2025-01-01T06:59:00.000Z"));
  times.push(new Date("2020-03-14T09:00:00.000Z")); // lone photo
  for (let i = 0; i < 67; i++) times.push(new Date(Date.UTC(2022, 5, 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24)))); // dense month

  const rows = times.map((takenAt, i) => ({
    id: `${PREFIX}${u.id}-${String(i).padStart(4, "0")}`,
    userId: u.id,
    kind: "photo" as const,
    status: "ready" as const,
    filename: `seed-${i}.jpg`,
    mimeType: "image/jpeg",
    size: 1_000_000,
    width: 4000,
    height: i % 3 === 0 ? 3000 : 2250,
    takenAt,
    originalKey: `seed/${u.id}/${i}.jpg`,
    thumbKey: `seed/${u.id}/${i}-thumb.jpg`,
  }));

  await db.delete(m).where(and(eq(m.userId, u.id), like(m.id, `${PREFIX}%`)));
  for (let i = 0; i < rows.length; i += 100) await db.insert(m).values(rows.slice(i, i + 100));
  console.log(`Inserted ${rows.length} rows`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
