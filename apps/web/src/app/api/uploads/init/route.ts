import { randomUUID } from "node:crypto";
import { uploadInitInput, type UploadInitResponse } from "@photovault/shared";
import { db, schema } from "@/db";
import { badRequest, json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { originalKey, presignPut, thumbKey } from "@/lib/s3";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const parsed = uploadInitInput.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.flatten());
  const input = parsed.data;

  const id = randomUUID();
  const ext = (input.filename.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const origKey = originalKey(user.id, id, ext);
  const thumb = thumbKey(user.id, id);

  await db.insert(schema.media).values({
    id,
    userId: user.id,
    kind: input.mimeType.startsWith("video/") ? "video" : "photo",
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    width: input.width,
    height: input.height,
    durationMs: input.durationMs,
    takenAt: input.takenAt ? new Date(input.takenAt) : new Date(),
    originalKey: origKey,
    thumbKey: thumb,
  });

  const body: UploadInitResponse = {
    mediaId: id,
    originalUploadUrl: await presignPut(origKey, input.mimeType),
    thumbUploadUrl: await presignPut(thumb, "image/jpeg"),
  };
  return json(body);
}
