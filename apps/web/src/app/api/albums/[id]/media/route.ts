import { and, eq, inArray, sql } from "drizzle-orm";
import { albumMediaInput } from "@photovault/shared";
import { db, schema } from "@/db";
import { badRequest, json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { allOwnedReady, getOwnedAlbum, loadAlbums } from "@/lib/albums";

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => json({ error: "Not found" }, 404);

async function touch(userId: string, albumId: string) {
  await db
    .update(schema.album)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(schema.album.id, albumId), eq(schema.album.userId, userId)));
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!(await getOwnedAlbum(user.id, id))) return notFound();

  const parsed = albumMediaInput.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return badRequest(parsed.error.flatten());
  const ids = [...new Set(parsed.data.mediaIds)];
  if (!(await allOwnedReady(user.id, ids))) return badRequest("Invalid mediaIds");

  try {
    await db
      .insert(schema.albumMedia)
      .values(ids.map((mediaId) => ({ albumId: id, mediaId })))
      .onConflictDoNothing();
  } catch {
    return badRequest("Invalid mediaIds"); // e.g. media deleted between the check and the insert
  }
  await touch(user.id, id);
  const [album] = await loadAlbums(user.id, id);
  return album ? json(album) : notFound();
}

// Removes links only; never touches media rows or S3 objects.
export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!(await getOwnedAlbum(user.id, id))) return notFound();

  const parsed = albumMediaInput.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return badRequest(parsed.error.flatten());

  await db
    .delete(schema.albumMedia)
    .where(and(eq(schema.albumMedia.albumId, id), inArray(schema.albumMedia.mediaId, [...new Set(parsed.data.mediaIds)])));
  await touch(user.id, id);
  const [album] = await loadAlbums(user.id, id);
  return album ? json(album) : notFound();
}
