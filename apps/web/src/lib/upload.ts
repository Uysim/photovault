import type { UploadInitInput, UploadInitResponse } from "@photovault/shared";

const THUMB_WIDTH = 480;
const HEIC_MESSAGE = "HEIC isn't supported on web, use the phone app";

export function validateFile(file: File): string | null {
  if (/\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type)) return HEIC_MESSAGE;
  if (!/^(image|video)\//.test(file.type)) return "Only photos and videos can be uploaded";
  return null;
}

type Thumb = { blob: Blob; width: number; height: number; durationMs?: number };

function canvasToJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.max(1, Math.round((h / w) * THUMB_WIDTH));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make thumbnail"))), "image/jpeg", 0.7),
  );
}

async function imageThumb(file: File): Promise<Thumb> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read this image");
  }
  try {
    const blob = await canvasToJpeg(bitmap, bitmap.width, bitmap.height);
    return { blob, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function videoThumb(file: File): Promise<Thumb> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Could not read this video")), 15000);
      video.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not read this video"));
      };
    });
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = 0;
      // Already at 0: some browsers never fire "seeked".
      setTimeout(resolve, 500);
    });
    const blob = await canvasToJpeg(video, video.videoWidth, video.videoHeight);
    return {
      blob,
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function putWithProgress(url: string, body: Blob, contentType: string, onProgress?: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload to storage failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload to storage failed (network or CORS)"));
    xhr.send(body);
  });
}

async function post(path: string, body: unknown, label: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${label} failed (${res.status})`);
  return res;
}

export async function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<void> {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);

  const isVideo = file.type.startsWith("video/");
  const thumb = await (isVideo ? videoThumb(file) : imageThumb(file));

  const input: UploadInitInput = {
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    width: thumb.width || undefined,
    height: thumb.height || undefined,
    durationMs: isVideo ? thumb.durationMs : undefined,
    takenAt: new Date(file.lastModified).toISOString(),
  };
  const init: UploadInitResponse = await (await post("/api/uploads/init", input, "Init")).json();

  await putWithProgress(init.thumbUploadUrl, thumb.blob, "image/jpeg");
  await putWithProgress(init.originalUploadUrl, file, file.type, onProgress);

  await post("/api/uploads/complete", { mediaId: init.mediaId }, "Complete");
}
