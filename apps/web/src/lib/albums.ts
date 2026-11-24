import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Album } from "@photovault/shared";
import { db, schema } from "@/db";
import { presignGet } from "@/lib/s3";

/** The album if it exists AND belongs to userId, else null (callers answer 404). */
export async function getOwnedAlbum(userId: string, albumId: string) {
  const [row] = await db
    .select()
    .from(schema.album)
    .where(and(eq(schema.album.id, albumId), eq(schema.album.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Albums of userId (optionally just one), newest updatedAt first, with the count of
 * ready media and the thumbnail of the newest ready item by (takenAt, id). One aggregated query.
 */
export async function loadAlbums(userId: string, albumId?: string): Promise<Album[]> {
  const a = schema.album;
  const am = schema.albumMedia;
  const m = schema.media;
  const where = albumId ? and(eq(a.userId, userId), eq(a.id, albumId)) : eq(a.userId, userId);

  const rows = await db
    .select({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      count: sql<number>`count(${m.id})::int`,
      coverKey: sql<string | null>`(array_agg(${m.thumbKey} order by ${m.takenAt} desc, ${m.id} desc) filter (where ${m.id} is not null))[1]`,
    })
    .from(a)
    .leftJoin(am, eq(am.albumId, a.id))
    .leftJoin(m, and(eq(m.id, am.mediaId), eq(m.status, "ready"), eq(m.userId, userId)))
    .where(where)
    .groupBy(a.id)
    .orderBy(desc(a.updatedAt), desc(a.id));

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      count: r.count,
      coverThumbUrl: r.coverKey ? await presignGet(r.coverKey) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
}

/** True only if every (deduped) id is a `ready` media row owned by userId. */
export async function allOwnedReady(userId: string, mediaIds: string[]): Promise<boolean> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(inArray(schema.media.id, ids), eq(schema.media.userId, userId), eq(schema.media.status, "ready")));
  return rows.length === ids.length;
}
