# Web Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user add photos and videos from the web gallery by drag-and-drop or an Upload button.

**Architecture:** A browser-side module runs the same flow as the phone (`init` → PUT thumbnail + original to S3 → `complete`) using the existing endpoints. The gallery page adds a drop zone, an Upload button and a progress list. No server, schema or shared-package changes.

**Tech Stack:** Next.js 15 / React 19 client component, browser canvas + XHR, existing `@photovault/shared` types.

**Spec:** `docs/superpowers/specs/2026-11-16-web-upload-design.md`

## Global Constraints

- Thumbnail: JPEG, 480px wide (same as mobile), content type `image/jpeg`.
- HEIC/HEIF files are rejected before any request, with the message "HEIC isn't supported on web, use the phone app".
- `takenAt` = `new Date(file.lastModified).toISOString()`.
- Uploads go straight to the presigned S3 URLs, never through the Next.js server.
- No test runner exists in `apps/web`; verification is `pnpm typecheck` plus manual browser checks (adding a test framework is out of scope).

## Review Focus

- A non-image/video file (e.g. PDF) dropped on the page: rejected with a message, no request sent.
- A HEIC file mixed in with good files: only the HEIC fails, the rest upload.
- A file the browser can't decode as an image or video (corrupt): that file shows an error, others continue.
- Dragging something that isn't a file (selected text, a link): no overlay, no upload.
- S3 PUT fails (e.g. CORS misconfigured): the file shows an error, and no `complete` call is made.

## File Structure

- Create `apps/web/src/lib/upload.ts`: the upload flow, no React.
- Modify `apps/web/src/app/page.tsx`: drop zone, button, progress list, refresh grid.
- Modify `apps/web/src/app/globals.css`: styles for the drop overlay and progress list.

---

### Task 1: Browser upload module

**Files:**
- Create: `apps/web/src/lib/upload.ts`

**Interfaces:**
- Produces:
  - `export function validateFile(file: File): string | null` returns an error message, or `null` if the file is allowed (`image/*` or `video/*`, not HEIC/HEIF; also check the file extension, since browsers often report an empty type for HEIC).
  - `export async function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<void>` runs the whole flow and throws `Error` with a readable message on any failure.

- [ ] **Step 1: Implement `validateFile`** in `upload.ts` per the signature above, using the exact HEIC message from Global Constraints and a different message for non-image/video types.

- [ ] **Step 2: Implement thumbnail helpers** (not exported): `makeThumbnail(file: File): Promise<{ blob: Blob; width: number; height: number; durationMs?: number }>`. Photos: load via `createImageBitmap`, draw to a canvas scaled to 480px wide, `toBlob("image/jpeg", 0.7)`. Videos: hidden `<video preload="metadata" muted playsinline>` with an object URL, wait for `loadeddata` then seek to 0 (`seeked`), draw the frame to the same canvas path, and read `video.duration` for `durationMs`. Revoke object URLs when done. Reject with a readable error if decoding fails. `width`/`height` returned are the original dimensions (they go to `init`).

- [ ] **Step 3: Implement `putWithProgress(url: string, body: Blob, contentType: string, onProgress?: (f: number) => void): Promise<void>`** (not exported) using `XMLHttpRequest` PUT with a `Content-Type` header; reject on non-2xx or network error with "Upload to storage failed (status)".

- [ ] **Step 4: Implement `uploadFile`**: `validateFile` (throw its message if any) → `makeThumbnail` → `POST /api/uploads/init` with `UploadInitInput` fields (`filename`, `mimeType` = `file.type`, `size`, `width`, `height`, `durationMs` for video, `takenAt`), parse as `UploadInitResponse` → PUT thumbnail to `thumbUploadUrl` as `image/jpeg` → PUT the file to `originalUploadUrl` with `file.type`, reporting progress → `POST /api/uploads/complete` with `{ mediaId }`. Throw "Init failed (status)" / "Complete failed (status)" on non-OK responses. Do not call `complete` if either PUT failed.

- [ ] **Step 5: Verify types**

Run: `pnpm --filter web typecheck`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/upload.ts
git commit -m "feat(web): browser upload module"
```

### Task 2: Drag-and-drop and Upload button in the gallery

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `uploadFile(file, onProgress)` and `validateFile(file)` from `@/lib/upload`; the existing `load(null)` in `page.tsx` to refresh the grid.

- [ ] **Step 1: Add state and handler in `Gallery`.** State: `uploads: { key: string; name: string; progress: number; status: "uploading" | "done" | "error"; error?: string }[]` and `dragging: boolean`. A function `addFiles(files: File[])` that, for each file, adds a list entry, runs `uploadFile` (up to 3 at a time), updates progress/status, and calls `load(null)` once after each file completes successfully (reset `loading.current` handling is already inside `load`; if a load is in flight, skip rather than queue). Files failing `validateFile` get an immediate error entry without a request.

- [ ] **Step 2: Wire drag-and-drop.** In a `useEffect` on `window`: `dragenter`/`dragover` call `preventDefault()` and set `dragging` only when `e.dataTransfer?.types` includes `"Files"`; `dragleave` clears it when the pointer leaves the window (`e.relatedTarget === null`); `drop` calls `preventDefault()`, clears `dragging`, and calls `addFiles(Array.from(e.dataTransfer.files))`. Remove listeners on cleanup. Render a full-screen overlay "Drop to upload" while `dragging`.

- [ ] **Step 3: Add the Upload button** to the top bar next to "Sign out": a button that clicks a hidden `<input type="file" multiple accept="image/*,video/*">`; its `onChange` calls `addFiles` and clears the input value. Update the empty-state text from "Upload from the mobile app." to "Drop files here or click Upload."

- [ ] **Step 4: Render the progress list** below the top bar: one row per entry with name, a `<progress>` (or percentage), and the error text for failed ones; a "Clear" button removes finished and failed rows.

- [ ] **Step 5: Add CSS** in `globals.css` for `.drop-overlay` (fixed, inset 0, centered text, dashed border, translucent background, `z-index: 20`, `pointer-events: none`) and `.uploads` list rows.

- [ ] **Step 6: Verify types**

Run: `pnpm --filter web typecheck`
Expected: exits 0.

- [ ] **Step 7: Manual check in the browser** (`pnpm dev:web`, signed in, MinIO running with bucket CORS allowing PUT from `http://localhost:3000`):
  1. Drag a JPG onto the page: overlay appears, progress runs, thumbnail shows in the grid with no reload.
  2. Click Upload, pick an MP4 and a PNG together: both appear, the video tile shows its duration badge.
  3. Drop a `.heic` file along with a JPG: HEIC row shows the HEIC message, JPG uploads.
  4. Drop a PDF: error row, no network request (check the Network tab).
  5. Drag selected text over the page: no overlay.
  6. Stop MinIO and drop a JPG: row shows an error, and the Network tab shows no `complete` call.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/globals.css
git commit -m "feat(web): drag-and-drop upload in gallery"
```
