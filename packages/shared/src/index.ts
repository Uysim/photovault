import { z } from "zod";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // single presigned PUT limit (5 GB)

export const mediaKind = z.enum(["photo", "video"]);
export type MediaKind = z.infer<typeof mediaKind>;

export const uploadInitInput = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().regex(/^(image|video)\//),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  takenAt: z.string().datetime().optional(),
});
export type UploadInitInput = z.infer<typeof uploadInitInput>;

export const uploadInitResponse = z.object({
  mediaId: z.string(),
  originalUploadUrl: z.string().url(),
  thumbUploadUrl: z.string().url(),
});
export type UploadInitResponse = z.infer<typeof uploadInitResponse>;

export const uploadCompleteInput = z.object({ mediaId: z.string() });

export interface MediaItem {
  id: string;
  kind: MediaKind;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  takenAt: string;
  thumbUrl: string;
  url: string;
}

export interface MediaPage {
  items: MediaItem[];
  nextCursor: string | null;
}

export const signUpInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().min(1),
});
export * from "./timeline";
export * from "./gallery-window";
export * from "./album";
