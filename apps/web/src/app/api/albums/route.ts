import { randomUUID } from "node:crypto";
import { createAlbumInput, type AlbumList } from "@photovault/shared";
import { db, schema } from "@/db";
import { badRequest, json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { allOwnedReady, loadAlbums } from "@/lib/albums";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const body: AlbumList = { albums: await loadAlbums(user.id) };
  return json(body);
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const raw = await req.json().catch(() => undefined);
  const parsed = createAlbumInput.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.flatten());
  const { name, mediaIds } = parsed.data;
  const ids = [...new Set(mediaIds ?? [])];

  // Ownership is validated before anything is written, so a bad id creates nothing.
  if (ids.length && !(await allOwnedReady(user.id, ids))) return badRequest("Invalid mediaIds");

  // The Neon HTTP driver used in deployed envs has no interactive transactions, so instead of
  // db.transaction we write the album then its links, and remove the album if linking fails.
  const id = randomUUID();
  await db.insert(schema.album).values({ id, userId: user.id, name });
  if (ids.length) {
    try {
      await db
        .insert(schema.albumMedia)
        .values(ids.map((mediaId) => ({ albumId: id, mediaId })))
        .onConflictDoNothing();
    } catch {
      await db.delete(schema.album).where(eq(schema.album.id, id));
      return badRequest("Invalid mediaIds");
    }
  }

  const [album] = await loadAlbums(user.id, id);
  return json(album, 201);
}
