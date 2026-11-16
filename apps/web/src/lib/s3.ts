import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Set S3_ENDPOINT (e.g. http://localhost:9000) to use MinIO or another S3-compatible store.
export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }),
});
const Bucket = process.env.S3_BUCKET!;

const UPLOAD_TTL = 60 * 60; // 1h to finish a big video upload
const VIEW_TTL = 60 * 60;

export const originalKey = (userId: string, mediaId: string, ext: string) => `u/${userId}/orig/${mediaId}.${ext}`;
export const thumbKey = (userId: string, mediaId: string) => `u/${userId}/thumb/${mediaId}.jpg`;

export const presignPut = (Key: string, ContentType: string) =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: UPLOAD_TTL });

export const presignGet = (Key: string) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: VIEW_TTL });

export async function headObject(Key: string) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket, Key }));
  } catch {
    return null;
  }
}

export async function deleteObjects(keys: string[]) {
  if (!keys.length) return;
  await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
}
