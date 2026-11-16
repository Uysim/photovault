import { and, eq } from "drizzle-orm";
import { uploadCompleteInput } from "@photovault/shared";
import { db, schema } from "@/db";
import { badRequest, json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { headObject } from "@/lib/s3";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const parsed = uploadCompleteInput.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const [row] = await db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.id, parsed.data.mediaId), eq(schema.media.userId, user.id)))
    .limit(1);
  if (!row) return json({ error: "Not found" }, 404);

  const [orig, thumb] = await Promise.all([headObject(row.originalKey), headObject(row.thumbKey)]);
  if (!orig || !thumb) return json({ error: "Upload not found in storage" }, 409);

  await db.update(schema.media).set({ status: "ready", size: orig.ContentLength ?? row.size }).where(eq(schema.media.id, row.id));
  return json({ ok: true });
}
