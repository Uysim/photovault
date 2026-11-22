import { z } from "zod";

export const ALBUM_NAME_MAX = 100;
export const ALBUM_MEDIA_BATCH = 200;

export const albumNameInput = z.string().trim().min(1).max(ALBUM_NAME_MAX);

export const createAlbumInput = z.object({
  name: albumNameInput,
  mediaIds: z.array(z.string().min(1)).max(ALBUM_MEDIA_BATCH).optional(),
});
export type CreateAlbumInput = z.infer<typeof createAlbumInput>;

export const renameAlbumInput = z.object({ name: albumNameInput });
export type RenameAlbumInput = z.infer<typeof renameAlbumInput>;

export const albumMediaInput = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(ALBUM_MEDIA_BATCH),
});
export type AlbumMediaInput = z.infer<typeof albumMediaInput>;

export interface Album {
  id: string;
  name: string;
  count: number;
  coverThumbUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumList {
  albums: Album[];
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
