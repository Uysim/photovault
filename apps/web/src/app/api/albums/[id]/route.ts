import { and, eq, sql } from "drizzle-orm";
import { renameAlbumInput } from "@photovault/shared";
import { db, schema } from "@/db";
import { badRequest, json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getOwnedAlbum, loadAlbums } from "@/lib/albums";

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => json({ error: "Not found" }, 404);

export async function GET(req: Request, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const [album] = await loadAlbums(user.id, id);
  return album ? json(album) : notFound();
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!(await getOwnedAlbum(user.id, id))) return notFound();

  const parsed = renameAlbumInput.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return badRequest(parsed.error.flatten());

  await db
    .update(schema.album)
    .set({ name: parsed.data.name, updatedAt: sql`now()` })
    .where(and(eq(schema.album.id, id), eq(schema.album.userId, user.id)));
  const [album] = await loadAlbums(user.id, id);
  return album ? json(album) : notFound();
}

// Deletes the album row only; album_media links cascade, media rows and S3 objects are untouched.
export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const [row] = await db
    .delete(schema.album)
    .where(and(eq(schema.album.id, id), eq(schema.album.userId, user.id)))
    .returning({ id: schema.album.id });
  return row ? json({ ok: true }) : notFound();
}
