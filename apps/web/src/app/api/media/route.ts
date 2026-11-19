import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import type { MediaItem, MediaPage } from "@photovault/shared";
import { db, schema } from "@/db";
import { json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { presignGet } from "@/lib/s3";

const PAGE = 60;

type MediaRow = typeof schema.media.$inferSelect;

async function toItem(r: MediaRow): Promise<MediaItem> {
  return {
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
  };
}

// Cursor = "<takenAt ISO>|<id>" (keyset pagination over takenAt desc, id desc).
// An empty id ("<ISO>|") means "strictly older (or, with dir=newer, strictly newer) than that instant".
// dir=newer returns the page strictly after the cursor, still ordered newest first;
// nextCursor then points at the newest returned item when more newer items exist.
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  const cursor = params.get("cursor");
  const newer = params.get("dir") === "newer";
  const m = schema.media;
  let where = and(eq(m.userId, user.id), eq(m.status, "ready"));
  if (cursor) {
    const [at, id = ""] = cursor.split("|");
    const d = new Date(at);
    if (newer) {
      where = and(where, or(gt(m.takenAt, d), id ? and(eq(m.takenAt, d), gt(m.id, id)) : undefined));
    } else {
      where = and(where, or(lt(m.takenAt, d), id ? and(eq(m.takenAt, d), lt(m.id, id)) : undefined));
    }
  }

  const rows = await db
    .select()
    .from(m)
    .where(where)
    .orderBy(...(newer ? [asc(m.takenAt), asc(m.id)] : [desc(m.takenAt), desc(m.id)]))
    .limit(PAGE + 1);
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  if (newer) page.reverse();

  const items = await Promise.all(page.map(toItem));

  // newest item of the page: first when newest-first order
  const edge = newer ? page[0] : page.at(-1);
  const body: MediaPage = { items, nextCursor: hasMore && edge ? `${edge.takenAt.toISOString()}|${edge.id}` : null };
  return json(body);
}
