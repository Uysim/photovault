import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import type { ImagePickerAsset } from "expo-image-picker";
import type { UploadInitResponse } from "@photovault/shared";
import { api } from "./api";

export type UploadState = {
  key: string;
  name: string;
  progress: number; // 0..1
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

function takenAt(asset: ImagePickerAsset): string {
  const raw = (asset.exif as Record<string, unknown> | null | undefined)?.DateTimeOriginal;
  if (typeof raw === "string") {
    const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString();
  }
  return new Date().toISOString();
}

async function makeThumbnail(asset: ImagePickerAsset): Promise<string> {
  if (asset.type === "video") {
    const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0, quality: 0.7 });
    return uri;
  }
  const out = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 480 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

async function put(url: string, fileUri: string, contentType: string, onProgress?: (p: number) => void) {
  const task = FileSystem.createUploadTask(
    url,
    fileUri,
    {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": contentType },
    },
    (e) => onProgress?.(e.totalBytesExpectedToSend ? e.totalBytesSent / e.totalBytesExpectedToSend : 0),
  );
  const res = await task.uploadAsync();
  if (!res || res.status < 200 || res.status >= 300) throw new Error(`Upload failed (${res?.status ?? "no response"})`);
}

export async function uploadAsset(asset: ImagePickerAsset, onProgress: (p: number) => void) {
  const isVideo = asset.type === "video";
  const mimeType = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
  const info = await FileSystem.getInfoAsync(asset.uri);
  const size = asset.fileSize ?? (info.exists && "size" in info ? info.size : 0);
  if (!size) throw new Error("Could not read file size");

  const thumbUri = await makeThumbnail(asset);

  const initRes = await api("/api/uploads/init", {
    method: "POST",
    body: JSON.stringify({
      filename: asset.fileName ?? `${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
      mimeType,
      size,
      width: asset.width,
      height: asset.height,
      durationMs: isVideo && asset.duration ? Math.round(asset.duration) : undefined,
      takenAt: takenAt(asset),
    }),
  });
  if (!initRes.ok) throw new Error(`Init failed (${initRes.status})`);
  const init: UploadInitResponse = await initRes.json();

  await put(init.thumbUploadUrl, thumbUri, "image/jpeg");
  await put(init.originalUploadUrl, asset.uri, mimeType, onProgress);

  const done = await api("/api/uploads/complete", { method: "POST", body: JSON.stringify({ mediaId: init.mediaId }) });
  if (!done.ok) throw new Error(`Complete failed (${done.status})`);
}
