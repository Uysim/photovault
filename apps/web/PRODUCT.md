# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A small team or community that stores and shares photos and videos together. Access is invite-only: an admin (identified by `ADMIN_EMAIL`) creates invite codes at `/admin`, and members sign up with one. Members browse a gallery, view media, and upload from the browser (drag-and-drop); the admin also manages invites. (Audience size and relationships between members are inferred from "small team or community"; refine if more specific.)

## Product Purpose

PhotoVault is private photo and video hosting the group controls. The web app is the browser surface for signing in, browsing the shared gallery, uploading media, and administering invites. Success: members can reliably put media in and find it again, and the admin can control who is in.

## Positioning

Private and self-hosted rather than a public photo service: invite-only access, media in the group's own private S3 bucket, uploads sent straight from the client to storage rather than through the app server. (Inferred from the repository; confirm before using as public claims.)

## Operating Context

Next.js on Vercel with Postgres (Neon) and a private S3 bucket. Better Auth handles sign-in. Uploads: client requests presigned URLs (`/api/uploads/init`), PUTs the original and a thumbnail to S3, then confirms (`/api/uploads/complete`); pending uploads are cleaned up after 24h by a cron. Large videos are supported (single PUT up to 5 GB).

## Capabilities and Constraints

- Sign in (`/login`), gallery (`/`), admin invites (`/admin`), browser upload with drag-and-drop.
- Photos and videos both supported; thumbnails are 480px JPEGs.
- Sharing model beyond the shared gallery (albums, per-item permissions, quotas, auto-backup) is not built; undecided.
- Shares its API and Zod schemas (`packages/shared`) with the mobile app.

## Evidence on Hand

No testimonials, customer logos, or usage metrics exist in the repo; do not fabricate any.

## Product Principles

- Private by default: nothing is reachable without an invite and a session.
- The media is the point; the interface should stay out of its way.
- Uploads must feel dependable, including for large videos and flaky connections.
- Admin controls stay simple and legible for a non-technical owner of a small group.
- Web and mobile are one product: same vocabulary and behavior for the same actions.
