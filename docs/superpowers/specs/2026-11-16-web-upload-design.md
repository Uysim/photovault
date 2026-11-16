# Web upload (design)

**Why:** The gallery at `/` is view-only; photos can only be added from the mobile app. The user wants to add files from the browser too.

**Size:** Small change. No server, schema or shared-package changes.

## What gets built
- Drag-and-drop onto the gallery page (full-page drop target with a visible overlay while dragging), plus an **Upload** button in the top bar that opens the file picker (multi-select). Both feed the same upload function.
- Per file, the same flow the phone uses:
  1. Make a 480px JPEG thumbnail in the browser (photos: canvas resize; videos: frame from a hidden `<video>` drawn to canvas).
  2. `POST /api/uploads/init` (filename, mimeType, size, width, height, durationMs, takenAt).
  3. PUT thumbnail and original straight to the presigned S3 URLs (XHR, so progress is available).
  4. `POST /api/uploads/complete`.
- Per-file progress and error state shown in a small list; finished items appear in the grid without a reload.
- `takenAt` uses `file.lastModified` (my call; EXIF parsing is out of scope).

## Goals
- Works for JPG/PNG/WebP/GIF and MP4/MOV/WebM, several files at once.

## Non-goals
- HEIC/HEIF: rejected up front with "not supported on web, use the phone app".
- Resumable or multipart upload, EXIF dates, server-side thumbnails, quotas.

## Approaches considered
- **A. Direct-to-S3 from the browser, mirroring the phone (chosen).** No server changes, no Vercel body limit.
- B. Upload through the Next.js server: rejected, Vercel's ~4.5 MB body limit breaks videos.
- C. Server-generated thumbnails: rejected for now, needs image processing and a "processing" state.

## Constraints and notes for the builder
- Session-cookie auth already works for the upload endpoints (`requireUser` reads the session from headers).
- The S3 bucket CORS must allow PUT from the web origin (README setup step); for local MinIO this may need configuring, and the builder should verify it.
- Put the upload logic in its own module (e.g. `apps/web/src/lib/upload.ts`) and keep `page.tsx` changes small.
