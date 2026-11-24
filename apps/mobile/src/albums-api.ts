import { api } from "./api";
import { ALBUM_MEDIA_BATCH, chunk, type Album, type AlbumList } from "@photovault/shared";

/** A failed albums request. `status` is the HTTP status, or 0 when the request never got an answer. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** createAlbum made the album but a later batch of ids failed; `album` is what exists now. */
export class PartialCreateError extends ApiError {
  constructor(
    readonly album: Album,
    status: number,
  ) {
    super(`Created “${album.name}”, but some items could not be added to it`, status);
    this.name = "PartialCreateError";
  }
}

async function request<T>(url: string, init: RequestInit | undefined, what: string): Promise<T> {
  let res: Response;
  try {
    res = await api(url, init);
  } catch {
    throw new ApiError(`Could not ${what}: network error`, 0);
  }
  if (!res.ok) throw new ApiError(`Could not ${what} (${res.status})`, res.status);
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

/**
 * Creates the album; the API caps ids per request, so extra ids are added in further batches.
 * The first batch is atomic with the album. If a later batch fails the album already exists:
 * it throws PartialCreateError, and callers should reload their album list.
 */
export async function createAlbum(name: string, mediaIds?: string[]): Promise<Album> {
  const [first = [], ...rest] = chunk(mediaIds ?? [], ALBUM_MEDIA_BATCH);
  const album = await request<Album>(
    "/api/albums",
    jsonInit("POST", first.length ? { name, mediaIds: first } : { name }),
    "create album",
  );
  try {
    for (const ids of rest) await request(`/api/albums/${enc(album.id)}/media`, jsonInit("POST", { mediaIds: ids }), "add to album");
  } catch (e) {
    throw new PartialCreateError(album, e instanceof ApiError ? e.status : 0);
  }
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

/** `onRemoved` gets each batch that succeeded, so a caller can tell what a later failure left done. */
export async function removeFromAlbum(id: string, mediaIds: string[], onRemoved?: (ids: string[]) => void): Promise<void> {
  for (const ids of chunk(mediaIds, ALBUM_MEDIA_BATCH)) {
    await request(`/api/albums/${enc(id)}/media`, jsonInit("DELETE", { mediaIds: ids }), "remove from album");
    onRemoved?.(ids);
  }
}
