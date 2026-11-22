import { ALBUM_MEDIA_BATCH, chunk, type Album, type AlbumList } from "@photovault/shared";

async function request<T>(url: string, init: RequestInit | undefined, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(`Could not ${what}: network error`);
  }
  if (!res.ok) throw new Error(`Could not ${what} (${res.status})`);
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const enc = encodeURIComponent;

export async function listAlbums(): Promise<Album[]> {
  return (await request<AlbumList>("/api/albums", undefined, "load albums")).albums;
}

export function getAlbum(id: string): Promise<Album> {
  return request<Album>(`/api/albums/${enc(id)}`, undefined, "load album");
}

/** Creates the album; the API caps ids per request, so extra ids are added in further batches. */
export async function createAlbum(name: string, mediaIds?: string[]): Promise<Album> {
  const [first = [], ...rest] = chunk(mediaIds ?? [], ALBUM_MEDIA_BATCH);
  const album = await request<Album>(
    "/api/albums",
    jsonInit("POST", first.length ? { name, mediaIds: first } : { name }),
    "create album",
  );
  for (const ids of rest) await request(`/api/albums/${enc(album.id)}/media`, jsonInit("POST", { mediaIds: ids }), "add to album");
  return rest.length ? getAlbum(album.id) : album;
}

export function renameAlbum(id: string, name: string): Promise<Album> {
  return request<Album>(`/api/albums/${enc(id)}`, jsonInit("PATCH", { name }), "rename album");
}

export async function deleteAlbum(id: string): Promise<void> {
  await request(`/api/albums/${enc(id)}`, { method: "DELETE" }, "delete album");
}

export async function addToAlbum(id: string, mediaIds: string[]): Promise<void> {
  for (const ids of chunk(mediaIds, ALBUM_MEDIA_BATCH)) {
    await request(`/api/albums/${enc(id)}/media`, jsonInit("POST", { mediaIds: ids }), "add to album");
  }
}

export async function removeFromAlbum(id: string, mediaIds: string[]): Promise<void> {
  for (const ids of chunk(mediaIds, ALBUM_MEDIA_BATCH)) {
    await request(`/api/albums/${enc(id)}/media`, jsonInit("DELETE", { mediaIds: ids }), "remove from album");
  }
}
