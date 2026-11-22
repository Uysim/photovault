# Albums (design)

**Why:** The gallery is one long personal timeline. Members have no way to group photos by trip, event or person, and so can't find "the Lisbon trip" without scrolling or remembering a date. Albums let each member organize their own library. They are personal: nobody else sees them.

**Size:** Project (two new tables, new endpoints, a filter on two existing endpoints, UI on web and mobile). Applies to both apps ("Web and mobile are one product").

## What the user sees

- **Albums list.** A new "Albums" place in each app (web: `/albums`; mobile: a screen reached from the gallery header). A grid of album cards: cover thumbnail, name, photo count. Newest-changed first. A "New album" action. Empty state when there are no albums.
- **Album view.** Opens like the main gallery, scoped to that album: day headings, sticky heading, and the year/month rail, all computed from the album's photos only. Header shows the album name with rename and delete-album actions.
- **Select mode.** Neither app has multi-select today, so this is new. In the main gallery, "Select" (web button; mobile long-press on a thumbnail) lets the member tick several items; an action bar offers **Add to album…**, opening a picker of existing albums plus "New album". In an album view, select mode offers **Remove from album** and Add to album…. Select mode is cancellable at any point.
- **Viewer.** In the main gallery the viewer is unchanged, plus an "Add to album…" action. Inside an album the viewer's primary action is **Remove from album**; permanent **Delete** remains available but secondary (and keeps its existing confirmation).
- **Delete album** asks for confirmation and says "Photos stay in your library." It never touches photos or stored files.
- Sketch (album view, web):

```
 ← Albums   Lisbon 2024              [Select] [Rename] [Delete album]    ┃ 2024
 Thu, 14 Nov 2024                                                        ┃  ·
 [▢][▢][▢][▢]                                                            ┃ 2023
 ...
```

## Goals
- Group a member's own photos and videos into named albums, many-to-many (a photo can be in several albums and always stays in the main timeline).
- Albums feel like the gallery: same headings, rail and paging behaviour, same vocabulary on web and mobile.
- Removing from an album is clearly distinct from deleting a photo, and can't destroy a photo by accident.

## Non-goals
- Sharing albums or any cross-member visibility (the product's gallery is per-member today; `PRODUCT.md` says sharing is undecided).
- Manual photo ordering, "date added" ordering, custom cover photo, nested albums, smart/auto albums, album search.
- Uploading directly into an album (upload to the library, then add).
- Drag-and-drop of photos onto albums on web.

## Anti-goals
- Albums chrome must not crowd the media ("the media leads; chrome recedes"). Select mode must be quiet until entered.
- Removing a photo from an album, or deleting an album, must never delete a `media` row or an S3 object.
- Select mode must never get stuck (always a visible way out; leaving the screen exits it).

## Approaches considered
Membership model (decided with the user): **collections** (many-to-many join table) over folders (one album per photo), because photos stay in the timeline and nothing is hidden or lost.

Album view:
- **A. Reuse the gallery machinery (chosen by the user, recommended).** `GET /api/media` and `GET /api/media/timeline` gain an optional `albumId` filter; the existing paging window hook takes an optional scope. Cost: album photos are always ordered by date taken (no manual order).
- **B. Dedicated album-items endpoint with its own ordering.** More flexible, but duplicates paging, headings and rail logic in both apps and risks web/mobile drift. Rejected.
- **C. Albums list plus a plain grid inside.** Smallest, but large albums would feel worse than the main gallery. Rejected.

## Design

### Data (new drizzle migration `0001`; generate with `pnpm db:generate`)
- `album`: `id` text pk, `userId` fk → `user` (cascade), `name` text not null, `createdAt`, `updatedAt` (bumped on rename and on add/remove). Index on `(userId, updatedAt)`.
- `album_media`: `albumId` fk → `album` (cascade), `mediaId` fk → `media` (cascade), `addedAt`; composite pk `(albumId, mediaId)`; index on `mediaId`. Deleting a media row (existing delete flow) or an album removes the join rows automatically, so counts and covers stay correct.

### Server (all routes use `requireUser`; every album lookup is scoped to the caller, and a non-owned or missing album returns 404)
- `GET /api/albums` → `{ albums: Album[] }`, ordered by `updatedAt desc`. `Album = { id, name, count, coverThumbUrl | null, createdAt, updatedAt }`. `count` counts only `ready` media; the cover is the thumbnail of the album's newest ready item by `(takenAt, id)`.
- `POST /api/albums` `{ name, mediaIds? }` → creates the album (optionally with initial items, used by "New album" from the picker). Returns the `Album`.
- `GET /api/albums/[id]` → the single `Album` (used for the album header and cold loads/deep links).
- `PATCH /api/albums/[id]` `{ name }` → rename. `DELETE /api/albums/[id]` → deletes the album and join rows only; must not call `deleteObjects`.
- `POST /api/albums/[id]/media` `{ mediaIds }` → add; idempotent (already-members are ignored). Every id must be a `ready` media row owned by the caller, otherwise the whole request fails with 400 and nothing is added. Limit 200 ids per call (my call).
- `DELETE /api/albums/[id]/media` `{ mediaIds }` → remove from album only (same limit; ids not in the album are ignored).
- `GET /api/media?albumId=…` and `GET /api/media/timeline?albumId=…`: same behaviour as today, restricted to media in that album (join on `album_media`) after verifying the album belongs to the caller. Cursor, `dir`, paging size and bucket/`before` semantics are unchanged.
- Name rules: trimmed, 1–100 characters; duplicate names allowed (my call: simplest, avoids a confusing error).
- Zod input schemas and the `Album`/`AlbumList` types go in `packages/shared`.

### Clients (web and mobile)
- Gallery window hook (`use-gallery-window` in each app) takes an optional `albumId`; it adds `albumId` to the page and timeline URLs and resets when it changes. The main gallery passes none, so its behaviour is unchanged. Everything else in the gallery window (jumps, bidirectional paging, rail, headings) is reused as is.
- Album mutations that change what a view shows (add, remove, delete album, rename) refresh the albums list; remove-from-album also removes the items from the open album window (the existing `remove` path) and refetches its timeline. Deleting a photo while in an album behaves as it does today and also refreshes counts.
- Select mode: a selected-ids set owned by the gallery screen; tiles show a selected state; an action bar replaces the usual header actions while active.
- Album picker: list of albums (name + count) with a "New album" row that asks for a name, creates the album with the selected items, and confirms with a brief message (toast/alert).
- Empty album (all photos removed) stays as an empty album with a hint to add photos from the library; it is not auto-deleted.
- Styling follows each app's `DESIGN.md` (web tokens in `globals.css`; mobile `theme.ts`). Accessibility: select-mode checkboxes and action bar are keyboard reachable on web and labelled for screen readers; touch targets meet the existing mobile minimums.

## Constraints and notes for the builder
- Web gallery is `apps/web/src/app/page.tsx`; mobile gallery is `apps/mobile/app/index.tsx` (flattened rows) with `viewer.tsx`; hooks are `apps/web/src/lib/use-gallery-window.ts` and `apps/mobile/src/use-gallery-window.ts`. Mobile uses expo-router (add `albums` and `album/[id]` routes); web uses the Next.js App Router (`/albums`, `/albums/[id]`). The album view should share the gallery rendering with the main page rather than copy it; extract if needed.
- Only one migration exists (`0000`); keep the new one separate and additive. No data backfill.
- **Base branch: latest `origin/main`.** The design reuses the gallery timeline (`/api/media/timeline`, the gallery window hooks, `packages/shared` timeline/window code, headings and rail), which is merged into `main` (PRs #1 and #2). Implement on a fresh branch from up-to-date `main`, not from `feat/gallery-timeline`.
- No test runner exists. Put join/scope and validation logic in small pure functions where cheap, run `pnpm typecheck`, and verify manually against a seeded library (`apps/web/scripts/seed-timeline.ts` is a starting point), including: cross-user access to albums and media ids returns 404/400; deleting a photo drops it from albums and counts; deleting an album leaves photos and S3 objects intact; an album spanning several years and a New Year boundary jumps correctly.
- Update `README.md` ("Later: shared albums" becomes personal albums done; sharing still later) and `apps/web/PRODUCT.md` / `apps/mobile/PRODUCT.md` capabilities.

## Settled after builder review
Calls I made (please check these):
1. **Photo delete is unchanged.** "Delete" in any viewer stays the existing permanent delete (row plus S3 objects) with its existing confirmation. No trash.
2. **Viewer knows its album.** Mobile: the viewer route gets an optional `albumId` param and a new "removed from album" event alongside the existing delete event on `gallery-events`; the album window drops the item via its `remove` path and refetches its timeline. Web: the inline viewer gets the album from the shared gallery component's props.
3. **Timeline SQL.** `/api/media/timeline` is raw SQL; with `albumId` it joins `album_media` after the ownership check. Verification must include counts and a New Year boundary inside an album.
4. **Add failures.** If a selected item was deleted before "Add", the request fails with 400 and nothing is added; the client shows an error and refreshes, with no automatic retry. "New album" with `mediaIds` is a single transaction, so a failure leaves no album behind.
5. **`updatedAt`** bumps on rename and on add/remove through the album endpoints, not when a photo is deleted elsewhere.
6. **Mobile select mode.** Long-press enters select mode; while active, tap toggles selection instead of opening the viewer. The rail drag is unaffected. The selected-id set lives outside the window, so it survives paging and jumps. No "select all". If more than 200 are selected, the client sends the calls in chunks of 200 (safe because add and remove are idempotent).

## Left to the builder
- Visual treatment of album cards, the select-mode action bar and the picker, within the existing design systems.
- Whether select mode on web also supports shift-click range selection.
- The exact entry point to Albums in each app's header, and the wording of confirmations.
- Query shape for count/cover (single query vs. aggregated join), as long as it is index-friendly at thousands of photos.
