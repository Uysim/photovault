import { randomUUID } from "node:crypto";
import { createAlbumInput, type AlbumList } from "@photovault/shared";
import { db, schema } from "@/db";
import { badRequest, json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { loadAlbums } from "@/lib/albums";
import { sql } from "drizzle-orm";

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

  const id = randomUUID();
  if (ids.length === 0) {
    await db.insert(schema.album).values({ id, userId: user.id, name });
  } else {
    // One statement = atomic on both drivers (the Neon HTTP driver has no interactive transactions).
    // The album is inserted only if every id is a ready media row owned by the caller; the join rows
    // come from the same statement, so a failure (e.g. FK violation from a concurrent media delete)
    // rolls the album back too. No row returned => nothing was written => 400.
    const idList = sql.join(ids.map((m) => sql`${m}`), sql`, `);
    const result = await db
      .execute(sql`
        WITH ok AS (
          SELECT count(*) = ${ids.length}::int AS ok FROM media
          WHERE id IN (${idList}) AND user_id = ${user.id} AND status = 'ready'
        ), a AS (
          INSERT INTO album (id, user_id, name)
          SELECT ${id}::text, ${user.id}::text, ${name}::text FROM ok WHERE ok.ok
          RETURNING id
        )
        INSERT INTO album_media (album_id, media_id)
        SELECT a.id, m FROM a, unnest(ARRAY[${idList}]::text[]) AS m
        ON CONFLICT DO NOTHING
        RETURNING album_id`)
      .catch((e: { code?: string; cause?: { code?: string } }) => {
        if ((e.cause?.code ?? e.code) === "23503") return null; // media vanished mid-statement
        throw e;
      });
    const rows = result ? (Array.isArray(result) ? result : result.rows) : [];
    if (rows.length === 0) return badRequest("Invalid mediaIds");
  }

  const [album] = await loadAlbums(user.id, id);
  return json(album, 201);
}
