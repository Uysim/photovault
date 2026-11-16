import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { deleteObjects } from "@/lib/s3";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const [row] = await db
    .delete(schema.media)
    .where(and(eq(schema.media.id, id), eq(schema.media.userId, user.id)))
    .returning();
  if (!row) return json({ error: "Not found" }, 404);

  await deleteObjects([row.originalKey, row.thumbKey]);
  return json({ ok: true });
}
