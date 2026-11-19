# PhotoVault

Private photo/video hosting. Next.js (web + API) on Vercel, Postgres (Neon), S3, Expo mobile app.

```
apps/web         Next.js: UI, Better Auth, upload/media APIs, cron
apps/mobile      Expo (expo-router): sign in, pick + upload, gallery, viewer
packages/shared  Zod schemas + API types
```

## Upload flow
1. Phone picks media, makes a 480px JPEG thumbnail.
2. `POST /api/uploads/init` creates a `pending` row, returns presigned PUT URLs (original + thumb).
3. Phone PUTs both files straight to S3 (never through Vercel).
4. `POST /api/uploads/complete` HEADs both objects and marks the row `ready`.
5. Daily cron (`/api/cron/cleanup`) deletes uploads still `pending` after 24h.

Browsing: `GET /api/media` pages newest first by cursor (`dir=newer` pages toward the latest after a jump); `GET /api/media/timeline` returns per-month counts that drive the year/month rail in both apps.

## Setup
1. `pnpm install`
2. S3: create a **private** bucket. CORS (for web playback): allow GET/PUT/HEAD from your web origin.
   IAM user needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/u/*`.
3. Vercel: create a Postgres (Neon) database, copy env vars; `cp apps/web/.env.example apps/web/.env.local` and fill in.
4. `pnpm db:migrate` (migration already generated in `apps/web/drizzle`).
5. `pnpm dev:web`. Sign up with `ADMIN_EMAIL` (no invite needed), open `/admin` to create invite codes.
6. Mobile: `cp apps/mobile/.env.example apps/mobile/.env`, set `EXPO_PUBLIC_API_URL`, then `pnpm dev:mobile`
   (use a dev build / `expo run:ios|android`; `expo-secure-store` and the picker work in Expo Go too for basic testing).

## Notes / next steps
- Uploads use a single presigned PUT (up to 5 GB). Add S3 multipart if you need resumable huge videos.
- Better Auth tables are hand-written in `apps/web/src/db/schema.ts`; run `npx @better-auth/cli generate` to diff after upgrades.
- Later: shared albums, CloudFront signed URLs, auto-backup, quotas.
