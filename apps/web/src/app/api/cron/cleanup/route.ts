import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { json, unauthorized } from "@/lib/http";
import { deleteObjects } from "@/lib/s3";

// Removes uploads that never completed (pending for > 24h) along with any partial S3 objects.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const stale = await db
    .delete(schema.media)
    .where(and(eq(schema.media.status, "pending"), lt(schema.media.createdAt, cutoff)))
    .returning();
  await deleteObjects(stale.flatMap((r) => [r.originalKey, r.thumbKey]));
  return json({ removed: stale.length });
}
