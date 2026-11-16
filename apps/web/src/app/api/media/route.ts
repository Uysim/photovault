import { and, desc, eq, lt, or } from "drizzle-orm";
import type { MediaItem, MediaPage } from "@photovault/shared";
import { db, schema } from "@/db";
import { json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { presignGet } from "@/lib/s3";

const PAGE = 60;

// Cursor = "<takenAt ISO>|<id>" (keyset pagination over takenAt desc, id desc)
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const cursor = new URL(req.url).searchParams.get("cursor");
  const m = schema.media;
  let where = and(eq(m.userId, user.id), eq(m.status, "ready"));
  if (cursor) {
    const [at, id] = cursor.split("|");
    const d = new Date(at);
    where = and(where, or(lt(m.takenAt, d), and(eq(m.takenAt, d), lt(m.id, id))));
  }

  const rows = await db.select().from(m).where(where).orderBy(desc(m.takenAt), desc(m.id)).limit(PAGE + 1);
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);

  const items: MediaItem[] = await Promise.all(
    page.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      filename: r.filename,
      mimeType: r.mimeType,
      size: r.size,
      width: r.width,
      height: r.height,
      durationMs: r.durationMs,
      takenAt: r.takenAt.toISOString(),
      thumbUrl: await presignGet(r.thumbKey),
      url: await presignGet(r.originalKey),
    })),
  );

  const last = page.at(-1);
  const body: MediaPage = { items, nextCursor: hasMore && last ? `${last.takenAt.toISOString()}|${last.id}` : null };
  return json(body);
}
