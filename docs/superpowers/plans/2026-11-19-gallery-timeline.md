# Gallery Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-day headings with a pinned current date and a draggable year/month rail that jumps the gallery to any period, on web and mobile.

**Architecture:** The server gains `GET /api/media/timeline` (counts per month plus a jump boundary) and a `dir=newer` option on the list endpoint. All pure logic (day grouping, rail layout, loaded-window transitions) lives in `packages/shared` so web and mobile behave identically; each app has a thin data hook and its own rail component.

**Tech Stack:** Next.js 15 / React 19 (web), Expo 58 / React Native 0.88 + expo-router (mobile), Drizzle + Postgres, `@photovault/shared` (TypeScript, zod).

**Spec:** `docs/superpowers/specs/2026-11-19-gallery-timeline-design.md`

## Global Constraints

- List order is `takenAt desc, id desc`; page size stays 60; cursor format stays `<takenAt ISO>|<id>`. A cursor means "strictly before `(takenAt, id)`" for `dir=older` (default) and "strictly after" for `dir=newer`.
- Timeline and list both filter to `status = ready`.
- Months are computed in the viewer's IANA time zone, passed as `tz`; missing or invalid `tz` falls back to `UTC` (never a 500).
- Each timeline bucket carries `before`: the UTC ISO instant of the start of the *following* month in `tz`. A jump uses cursor `` `${before}|` `` (empty id). Clients never do zone-aware month math for jumps.
- The time zone is read once per app load from `Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `UTC`; if it changes while open, refetch the timeline. Headings, buckets and jumps all use that one zone.
- Day headings use the viewer's locale and zone, e.g. `Thu, 14 Nov 2024` (en-GB-style; exact wording follows locale).
- No schema migration. No test runner exists; verification is `pnpm typecheck` plus the manual checks written in each task (adding a test framework is out of scope). Pure logic is kept in small functions; the scratch scripts in tasks 1-2 are not committed.
- Styling follows each app's existing tokens: web `apps/web/src/app/globals.css` (`--cloth`, `--page`, `--ink-dim`, `--gold`, …), mobile `apps/mobile/src/theme.ts` (`color`, `font`, `radius`). Rail and headings are quiet (dim ink) until hovered, touched or dragged. Respect `prefers-reduced-motion` and platform text size.
- The loaded window grows without trimming (no page eviction).

## Review Focus

- A photo taken just after local midnight on 1 Jan (or just before it on 31 Dec) in a non-UTC zone (e.g. `Asia/Phnom_Penh`, `America/Los_Angeles`): heading, rail bucket and jump target all agree on the same day/month. Owned by Tasks 1 and 3.
- The user jumps (or pulls to refresh) while an older/newer page request is still in flight: the stale response must not be merged into the new window. Owned by Tasks 5 and 8.
- Many items sharing the identical `takenAt` (bulk uploads) straddling a page seam: paging older, newer and a jump at that instant show no duplicates and no missing items. Owned by Task 4.
- Mobile: opening a photo and coming back (focus) after a jump must not reset the window to the newest page; deleting in the viewer removes the item and refreshes the rail. Owned by Task 8.
- Empty library, a single photo, or a single month: no rail/headings for empty, no layout error for one bucket; a month with 1 photo among months of thousands is still reachable by drag. Owned by Tasks 1, 7 and 10.

---

### Task 1: Shared timeline helpers

**Files:**
- Create: `packages/shared/src/timeline.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./timeline";`)

**Interfaces:**
- Produces (all exported from `@photovault/shared`):
  - `interface TimelineBucket { year: number; month: number /* 1-12 */; count: number; before: string }`
  - `interface MediaTimeline { buckets: TimelineBucket[] }` (newest first)
  - `interface DayGroup { key: string; label: string; items: MediaItem[] }`
  - `currentTimeZone(): string`
  - `dayKey(iso: string, tz: string): string` → `"2024-11-14"` (local date in `tz`)
  - `dayLabel(iso: string, tz: string, locale?: string): string`
  - `groupByDay(items: MediaItem[], tz: string, locale?: string): DayGroup[]` (input newest-first, order preserved, consecutive items with the same `dayKey` grouped)
  - `monthOf(iso: string, tz: string): { year: number; month: number }`
  - `jumpCursor(bucket: TimelineBucket): string` → `` `${bucket.before}|` ``
  - `interface RailSegment { year: number; month: number; count: number; before: string; top: number; height: number }`
  - `layoutRail(buckets: TimelineBucket[], trackHeight: number, minSegment: number): RailSegment[]` — segments tile `[0, trackHeight]` exactly in bucket order; heights proportional to `count`, each at least `min(minSegment, trackHeight / buckets.length)`.
  - `segmentAtY(segments: RailSegment[], y: number): RailSegment | null` (clamps y into range; null only when `segments` is empty)
  - `railYFor(segments: RailSegment[], at: { year: number; month: number }, fraction: number): number | null` (null if no such bucket; `fraction` 0 = top of the segment)
  - `yearLabels(segments: RailSegment[], minGap: number): { year: number; top: number }[]` (first segment of each year; skips a label closer than `minGap` to the previously kept one)

- [ ] **Step 1: Write the scratch verification script** (`<scratchpad>/verify-timeline.ts`, not committed) importing from `packages/shared/src/timeline`, asserting with `node:assert`:
  - `dayKey("2024-12-31T17:30:00.000Z", "Asia/Phnom_Penh") === "2025-01-01"` and `dayKey(same, "UTC") === "2024-12-31"`.
  - `dayKey("2025-01-01T06:59:00.000Z", "America/Los_Angeles") === "2024-12-31"`.
  - `monthOf("2024-12-31T17:30:00.000Z", "Asia/Phnom_Penh")` equals `{ year: 2025, month: 1 }`.
  - `dayLabel("2024-11-14T10:00:00.000Z", "UTC", "en-US") === "Thu, Nov 14, 2024"`.
  - `groupByDay` on 5 items (two on 14 Nov, one on 13 Nov, two on 2 Nov, UTC) returns 3 groups with lengths `[2,1,2]`, keys in input order.
  - `layoutRail` with buckets counts `[1000, 1, 1]`, `trackHeight 300`, `minSegment 8`: heights sum to 300, last two heights ≥ 8, first ≥ the others; with 100 buckets of count 1 and `trackHeight 200`, every height is 2 and sum is 200.
  - `segmentAtY(segs, -5)` is the first segment, `segmentAtY(segs, 9999)` the last, `segmentAtY([], 0)` is null.
  - `railYFor(segs, {year, month}, 0)` equals that segment's `top`; fraction 1 equals `top + height`; unknown month → null.
  - `yearLabels` over 3 months spanning 2 years returns one label per year; with `minGap` larger than the gap between them, only the first is kept.
- [ ] **Step 2: Run to verify it fails**

Run: `pnpm dlx tsx <scratchpad>/verify-timeline.ts`
Expected: fails (module has no such exports).

- [ ] **Step 3: Implement the interfaces above in `packages/shared/src/timeline.ts`.** Use `Intl.DateTimeFormat` with `timeZone: tz` and `formatToParts` for `dayKey`/`monthOf`/`dayLabel`; if `Intl` throws for the zone, fall back to `UTC` (Hermes `Intl` can be uneven). `dayLabel` options: weekday short, day numeric, month short, year numeric. Export from `index.ts`.
- [ ] **Step 4: Run to verify it passes**

Run: `pnpm dlx tsx <scratchpad>/verify-timeline.ts && pnpm typecheck`
Expected: script exits 0 with no assertion errors; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/timeline.ts packages/shared/src/index.ts
git commit -m "feat(shared): timeline types and day/rail helpers"
```

---

### Task 2: Shared loaded-window state

**Files:**
- Create: `packages/shared/src/gallery-window.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./gallery-window";`)

**Interfaces:**
- Consumes: `MediaItem`, `MediaPage` from `packages/shared/src/index.ts`.
- Produces:
  - `interface GalleryWindow { items: MediaItem[]; olderCursor: string | null; newerCursor: string | null }` (`newerCursor === null` ⇔ the window reaches the newest photo)
  - `emptyWindow: GalleryWindow`
  - `cursorOf(item: MediaItem): string` → `` `${item.takenAt}|${item.id}` ``
  - `startWindow(page: MediaPage, jumped: boolean): GalleryWindow` — `olderCursor = page.nextCursor`; `newerCursor = jumped && page.items[0] ? cursorOf(page.items[0]) : null`
  - `appendOlder(w: GalleryWindow, page: MediaPage): GalleryWindow` — appends unseen ids, sets `olderCursor = page.nextCursor`
  - `prependNewer(w: GalleryWindow, page: MediaPage): GalleryWindow` — `page.items` are newest-first; prepends unseen ids, sets `newerCursor = page.nextCursor`
  - `mergeNewest(w: GalleryWindow, page: MediaPage): GalleryWindow` — only when `newerCursor === null`: adds unseen ids from `page.items` and re-sorts by `takenAt` desc then `id` desc; otherwise returns `w` unchanged
  - `removeItem(w: GalleryWindow, id: string): GalleryWindow`
  - `isAtNewest(w: GalleryWindow): boolean`

- [ ] **Step 1: Write the scratch verification script** (`<scratchpad>/verify-window.ts`, not committed), using small fake items (`id`, `takenAt`), asserting:
  - `startWindow(page, false).newerCursor === null`; `startWindow(page, true).newerCursor === "<first takenAt>|<first id>"`; `startWindow({items: [], nextCursor: null}, true).newerCursor === null`.
  - `appendOlder` ignores an item already present (no duplicate ids) and updates `olderCursor`.
  - `prependNewer` puts newer items first, keeps order, no duplicates, and `newerCursor` becomes `null` when `page.nextCursor` is null (`isAtNewest` true).
  - `mergeNewest` on a jumped window (`newerCursor` set) returns the identical object; on a newest window it inserts a newer item at the front and sorts two items with equal `takenAt` by `id` desc.
  - `removeItem` removes by id and leaves cursors alone.
- [ ] **Step 2: Run to verify it fails**

Run: `pnpm dlx tsx <scratchpad>/verify-window.ts`
Expected: fails (module missing).

- [ ] **Step 3: Implement the interfaces above** (pure functions, no mutation of the input window).
- [ ] **Step 4: Run to verify it passes**

Run: `pnpm dlx tsx <scratchpad>/verify-window.ts && pnpm typecheck`
Expected: exits 0; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/gallery-window.ts packages/shared/src/index.ts
git commit -m "feat(shared): gallery window state transitions"
```

---

### Task 3: Timeline endpoint (+ dev seed script)

**Files:**
- Create: `apps/web/src/app/api/media/timeline/route.ts`
- Create: `apps/web/scripts/seed-timeline.ts` (dev-only)

**Interfaces:**
- Consumes: `MediaTimeline` (Task 1), `requireUser`, `unauthorized`, `json`, `db`, `schema`.
- Produces: `GET /api/media/timeline?tz=<IANA>` → `MediaTimeline`, newest month first; 401 when signed out.

- [ ] **Step 1: Write the seed script.** `pnpm dlx tsx --env-file=apps/web/.env.local apps/web/scripts/seed-timeline.ts <user-email>` inserts ~400 `ready` photo rows for that user across 2019-2024 using relative imports (not `@/`), with these fixed cases: a burst of 70 rows sharing one identical `takenAt`; `2024-12-31T17:30:00Z` and `2025-01-01T06:59:00Z` rows; one lone photo in 2020-03; ids prefixed `seed-` so they can be deleted (`--clean` flag deletes them). Thumb/original keys may point at nonexistent objects (images will be broken; layout is what's being tested).
- [ ] **Step 2: Run it** with a dev user and confirm rows exist.

Run: `pnpm dlx tsx --env-file=apps/web/.env.local apps/web/scripts/seed-timeline.ts <email>`
Expected: prints the number of rows inserted.

- [ ] **Step 3: Implement `GET` in `apps/web/src/app/api/media/timeline/route.ts`.** Validate `tz` with `new Intl.DateTimeFormat("en", { timeZone: tz })` in a try/catch, defaulting to `UTC`. One raw SQL aggregate over the user's `ready` rows: local = `taken_at AT TIME ZONE 'UTC' AT TIME ZONE <tz>`; group by `date_trunc('month', local)`; `count(*)::int`; `before` = `((month_start + interval '1 month') AT TIME ZONE <tz> AT TIME ZONE 'UTC')` formatted with `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`; order by month desc. Bind `tz` as a parameter, never interpolate it. Confirm the query uses `media_user_taken_idx` (EXPLAIN) or note if it doesn't.
- [ ] **Step 4: Verify manually** (dev server running, signed in via cookie in the browser):
  - `/api/media/timeline?tz=UTC` includes `{year: 2024, month: 12}` containing the `17:30Z` row and `{year: 2025, month: 1}` only with rows ≥ `2025-01-01T00:00Z`.
  - `/api/media/timeline?tz=Asia/Phnom_Penh` files the `2024-12-31T17:30:00Z` row under `{year: 2025, month: 1}`; its January bucket's `before` is `2025-01-31T17:00:00.000Z`.
  - `?tz=Not/AZone` and no `tz` both return the UTC result with status 200.
  - Signed out → 401. The sum of all `count`s equals the number of `ready` rows.
- [ ] **Step 4b: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/media/timeline/route.ts apps/web/scripts/seed-timeline.ts
git commit -m "feat(web): media timeline endpoint and dev seed script"
```

---

### Task 4: `dir=newer` on the list endpoint

**Files:**
- Modify: `apps/web/src/app/api/media/route.ts`

**Interfaces:**
- Consumes: existing `GET /api/media`.
- Produces: `GET /api/media?cursor=<c>&dir=newer` returns the up-to-60 items strictly after `(takenAt, id) = c`, **ordered newest first**, as `MediaPage` whose `nextCursor` is the cursor (`<takenAt ISO>|<id>`) of the newest returned item when more newer items exist, else `null`. `dir` absent or `older` keeps today's behaviour exactly. A cursor with an empty id is valid for `older` and means "strictly older than that instant".

- [ ] **Step 1: Implement.** For `newer`: where `gt(takenAt, d) or (eq(takenAt, d) and gt(id, id))`, order `asc, asc`, limit `PAGE + 1`, drop the extra, reverse for the response. Reuse the existing row-to-`MediaItem` mapping (extract a local helper rather than duplicating it).
- [ ] **Step 2: Verify manually with the seeded burst** (70 rows with identical `takenAt`), using the browser (signed in) or `curl` with the session cookie:
  - Walking `older` from the start until `nextCursor` is null, and separately walking `newer` from the oldest item's cursor back to the start, each yield every seeded+existing id exactly once (compare counts and uniqueness) — in particular across the 70-row burst, which straddles a 60-item page seam.
  - Order of every `newer` page is newest first; the page after the last returns `nextCursor: null`.
  - `?cursor=2020-04-01T00:00:00.000Z|&dir=older` first item is the newest photo strictly before that instant (the lone `2020-03` photo, or later if others exist in March).
  - Default (no `dir`) response is byte-for-byte the same shape as before.
- [ ] **Step 3: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/media/route.ts
git commit -m "feat(web): page newer items on the media list endpoint"
```

---

### Task 5: Web data hook (no visual change yet)

**Files:**
- Create: `apps/web/src/lib/use-gallery-window.ts`
- Modify: `apps/web/src/app/page.tsx` (replace `items/cursor/done/load/refresh` and the delete state update with the hook; keep all upload/drag/viewer code as is)

**Interfaces:**
- Consumes: Task 2 functions, `TimelineBucket`/`jumpCursor`/`currentTimeZone` (Task 1), the two endpoints.
- Produces: `useGalleryWindow(enabled: boolean): { items: MediaItem[]; timeline: TimelineBucket[]; tz: string; hasOlder: boolean; hasNewer: boolean; loading: boolean; loadOlder(): Promise<void>; loadNewer(): Promise<void>; jumpTo(bucket: TimelineBucket): Promise<void>; jumpToNewest(): Promise<void>; refreshAfterUpload(): void; remove(id: string): void }`
  - Initial load (when `enabled` becomes true): newest page + timeline fetched with `tz`.
  - `jumpTo` fetches `/api/media?cursor=<jumpCursor(bucket)>` and replaces the window with `startWindow(page, true)`; `jumpToNewest` re-fetches page 1 with `startWindow(page, false)`.
  - `refreshAfterUpload`: debounced 300 ms (as today); always refetches the timeline; fetches page 1 and applies `mergeNewest` (a no-op when the window isn't at the newest end).
  - `remove(id)`: `removeItem` then refetch timeline.
  - A generation counter increments on every jump/reset; a response from an earlier generation is discarded. At most one in-flight request per direction.
  - If `currentTimeZone()` changes (check on `visibilitychange`), refetch the timeline and reset to newest.

- [ ] **Step 1: Implement the hook** per the interface above, using `fetch` with the session cookie like today's page.
- [ ] **Step 2: Wire `page.tsx` to it.** "Load more" calls `loadOlder` and shows while `hasOlder`; the empty-state condition uses `items.length === 0 && !hasOlder && !loading`. `remove` replaces the local filter. No visual change.
- [ ] **Step 3: Verify manually** (dev server, seeded user): gallery loads newest-first; "Load more" appends until it disappears; upload a file → it appears at top; delete an item → it disappears; in devtools Network, one timeline request per load/upload/delete. Temporarily call `jumpTo` from the console-exposed debug (remove afterward) or defer jump checks to Task 7; confirm in code review that a stale-generation response is dropped.
- [ ] **Step 4: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/use-gallery-window.ts apps/web/src/app/page.tsx
git commit -m "refactor(web): drive the gallery from a shared window hook"
```

---

### Task 6: Web day headings and pinned date

**Files:**
- Modify: `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `groupByDay(items, tz)` (Task 1), hook output (Task 5).
- Produces: markup `section.day > h2.day-heading + div.grid`, one per `DayGroup`; `.cell` keeps `data-id={item.id}` (Task 7 reads it).

- [ ] **Step 1: Render grouped days.** Replace the single `.grid` with one section per group; remove the per-tile date `span` from `.caption` (keep the video duration label; omit the caption element for photos). The viewer bar's date stays.
- [ ] **Step 2: Styles.** `.day-heading { position: sticky; top: 0; z-index: 2; background: var(--page); color: var(--ink-dim); font-size: 0.875rem; padding: 10px 0 8px; }`, grid spacing between days; ink-dim until it is the pinned one is optional. Keep `.grid` rules as they are.
- [ ] **Step 3: Verify manually (seeded data):** headings read like `Thu, 14 Nov 2024`; while scrolling, the current day's heading stays at the top and is replaced by the next day's as it arrives; the burst day shows one heading; a photo at `2024-12-31T17:30:00Z` appears under `1 Jan 2025` when the browser zone is `Asia/Phnom_Penh` (change zone via devtools Sensors) and under `31 Dec 2024` in UTC; empty library shows no headings.
- [ ] **Step 4: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/globals.css
git commit -m "feat(web): per-day headings with a pinned current date"
```

---

### Task 7: Web timeline rail, jumping and newer paging

**Files:**
- Create: `apps/web/src/app/timeline-rail.tsx`
- Modify: `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `layoutRail`, `segmentAtY`, `railYFor`, `yearLabels`, `monthOf` (Task 1); hook (Task 5); `.cell[data-id]` (Task 6).
- Produces: `TimelineRail(props: { buckets: TimelineBucket[]; active: { year: number; month: number; fraction: number } | null; onJump(bucket: TimelineBucket): void; onJumpNewest(): void })` — renders nothing when `buckets` is empty.

- [ ] **Step 1: Implement `TimelineRail`.** Fixed to the right edge (`position: fixed; top` below the top bar, `bottom: 16px`, ~44px wide); measure the track with `ResizeObserver` and call `layoutRail(buckets, height, 4)`. Year labels from `yearLabels(segments, 20)` (clickable buttons, also the keyboard path: Tab to each year, Enter jumps; `aria-label="Jump to 2020"`); a "Latest" control at the top calls `onJumpNewest`. Pointer drag (`pointerdown/move/up` with capture): shows a bubble with the month and year of `segmentAtY`; releasing jumps to that bucket. A thumb marks `railYFor(segments, active, active.fraction)`. Low-contrast by default, brighter on hover/drag/focus; transitions off under `prefers-reduced-motion`.
- [ ] **Step 2: Wire into `page.tsx`.** Reserve a right gutter (~56px) on `.page` so tiles never sit under the rail. Compute `active`: on scroll (rAF-throttled), find the first `.cell` whose `getBoundingClientRect().bottom > 0`, look its item up by `data-id`, use `monthOf(item.takenAt, tz)` and the item's index among loaded items of that month ÷ count of loaded items in that month as `fraction`. `onJump` → `jumpTo(bucket)` then `window.scrollTo(0, 0)`.
- [ ] **Step 3: Automatic newer/older paging with scroll compensation.** Top sentinel (rendered only while `hasNewer`) and bottom sentinel (while `hasOlder`) observed with `IntersectionObserver` call `loadNewer`/`loadOlder`; keep the "Load more" button as the fallback. Before `loadNewer` applies, record `document.documentElement.scrollHeight`; in a `useLayoutEffect` after the items change, add the height delta to `scrollTop` so the viewport doesn't move; set `overflow-anchor: none` on the gallery container to avoid double adjustment (Safari has no native anchoring).
- [ ] **Step 3b: Verify manually (seeded data):**
  - Drag the rail to 2020: bubble shows the month/year; on release the first heading is in that month (or the nearest earlier month with photos) and scrolling down continues older.
  - After a jump, scroll up: newer photos load with no visible jump and reach the newest; the pinned date and rail thumb follow; "Latest" returns to the newest page.
  - Tab to a year label and press Enter: jumps. A 1-photo month (`2020-03`) is reachable by dragging.
  - Start a jump while "Load more" is mid-request (throttle network to slow 3G): the old response does not appear in the new window.
  - Upload a file while mid-jump: the list isn't disturbed, rail counts update; upload at the newest end: item appears at top.
  - Empty library: no rail. Single month: rail renders one segment without errors. Narrow window (≤520px): no horizontal scroll.
- [ ] **Step 4: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/timeline-rail.tsx apps/web/src/app/page.tsx apps/web/src/app/globals.css
git commit -m "feat(web): year/month rail with jump and newer paging"
```

---

### Task 8: Mobile data hook and gallery events

**Files:**
- Create: `apps/mobile/src/use-gallery-window.ts`, `apps/mobile/src/gallery-events.ts`
- Modify: `apps/mobile/app/index.tsx` (replace `items/cursor/load`; keep upload code), `apps/mobile/app/viewer.tsx` (emit on successful delete)

**Interfaces:**
- Consumes: Tasks 1-2 shared functions, `api()` from `apps/mobile/src/api.ts`.
- Produces:
  - `useGalleryWindow()` with the same shape as the web hook (Task 5) plus `refresh(): Promise<void>` (pull-to-refresh: reset to newest, refetch timeline) and `loadError: boolean`; it takes no `enabled` argument (mobile screens are only reachable when signed in).
  - `gallery-events.ts`: `emitDeleted(id: string): void` and `onDeleted(cb: (id: string) => void): () => void` (returns unsubscribe).
  - `refreshAfterUpload()` is called when the upload queue drains (replaces `load(null)` in `drain`).
  - **Focus behaviour:** `useFocusEffect` must *not* reset the window. On first focus it does the initial load; on later focuses it only refetches the timeline and applies `mergeNewest` (no-op mid-jump).
  - Same generation-counter rule as web: responses from before the latest jump/reset are discarded.

- [ ] **Step 1: Implement the hook and events**, mirroring Task 5's semantics via `api()`.
- [ ] **Step 2: Wire `index.tsx`** (keep the existing `FlatList` as is for now): `onEndReached` → `loadOlder`; `onRefresh` → `refresh`; subscribe to `onDeleted` → `remove(id)`; `viewer.tsx` calls `emitDeleted(id)` after a successful delete, before navigating back.
- [ ] **Step 3: Verify manually** (Expo dev client against the seeded server): gallery loads and paginates as before; open a photo and go back → scroll position and loaded pages are kept (no reset to the newest page); delete a photo in the viewer → it disappears from the grid without a reload; upload a photo → it appears after the queue drains; pull-to-refresh returns to the newest page.
- [ ] **Step 4: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/use-gallery-window.ts apps/mobile/src/gallery-events.ts apps/mobile/app/index.tsx apps/mobile/app/viewer.tsx
git commit -m "refactor(mobile): drive the gallery from a shared window hook"
```

---

### Task 9: Mobile day headings, pinned date and newer paging

**Files:**
- Create: `apps/mobile/src/rows.ts`
- Modify: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `groupByDay` (Task 1), hook (Task 8).
- Produces in `rows.ts`:
  - `type Row = { type: "heading"; key: string; label: string } | { type: "tiles"; key: string; items: MediaItem[] }`
  - `buildRows(groups: DayGroup[], cols: number): { rows: Row[]; headingIndices: number[] }` — per group one heading row followed by rows of up to `cols` items; `key`s stable across loads (`h:<dayKey>`, `t:<first item id>`); `headingIndices` are the row indices of headings.

- [ ] **Step 1: Scratch-verify `buildRows`** (`<scratchpad>/verify-rows.ts`, not committed): 7 items in one day with `cols = 3` → rows `heading, tiles(3), tiles(3), tiles(1)`, `headingIndices = [0]`; two days → second heading's index is correct.
- [ ] **Step 2: Run to verify it fails, implement `rows.ts`, run to verify it passes**

Run: `pnpm dlx tsx <scratchpad>/verify-rows.ts`
Expected: fails first, then exits 0.

- [ ] **Step 3: Switch the `FlatList` to rows.** Drop `numColumns`/`columnWrapperStyle`; `renderItem` renders a heading (`font.semibold`, `color.inkDim`, 15px, sticky background `color.cloth`) or a row of `cols` equally-sized tiles (existing tile `Pressable` unchanged, gap `GAP`). Set `stickyHeaderIndices={headingIndices}` so the current day stays pinned. Newer paging: `onStartReached={loadNewer}` with `onStartReachedThreshold` ≈ 0.5, and `maintainVisibleContentPosition={{ minIndexForVisible: 1 }}` so prepends don't shift the view. Keep `onEndReached` → `loadOlder`, pull-to-refresh → `refresh`, the empty/error states, and `key={cols}`.
- [ ] **Step 4: Verify manually** (iOS and Android dev client if both available): headings show per day; the current day's heading pins and is replaced by the next; scrolling up at a window start loads newer without the view jumping; rotating/changing column count keeps things consistent; empty library shows only the empty state.
- [ ] **Step 5: Run** `pnpm typecheck` — Expected: clean.
- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/rows.ts apps/mobile/app/index.tsx
git commit -m "feat(mobile): per-day headings with a pinned current date"
```

---

### Task 10: Mobile timeline rail and jumping

**Files:**
- Create: `apps/mobile/src/timeline-rail.tsx`
- Modify: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `layoutRail`, `segmentAtY`, `railYFor`, `yearLabels`, `monthOf`, `jumpTo` / `jumpToNewest` (Task 8), `Row` data (Task 9).
- Produces: `TimelineRail(props: { buckets: TimelineBucket[]; active: { year: number; month: number; fraction: number } | null; onJump(bucket: TimelineBucket): void; onJumpNewest(): void })` — renders nothing for empty `buckets`.

- [ ] **Step 1: Implement `TimelineRail`** with the built-in `PanResponder` (no new dependency): absolutely positioned on the right, ~28px wide touch strip, full gallery height minus safe areas; `onLayout` gives the track height for `layoutRail(buckets, height, 4)`; year labels from `yearLabels(segments, 20)` (tap to jump); a "Latest" control at the top; while dragging, a bubble shows the month and year of `segmentAtY`, releasing jumps. Dim by default (`color.inkDim` at reduced opacity), brighter while touched; use `theme.ts` tokens and `font.semibold`; labels have `accessibilityRole="button"` and `accessibilityLabel="Jump to 2020"`; scale with platform text size where it affects labels.
- [ ] **Step 2: Wire into `index.tsx`.** Track the top visible row via `onViewableItemsChanged` (`viewabilityConfig` with `itemVisiblePercentThreshold: 1`), take its first item (or the next tiles row for a heading), compute `active` with `monthOf` and the same index-within-month fraction as web. `onJump` → `jumpTo(bucket)` then `listRef.scrollToOffset({ offset: 0, animated: false })`; `onJumpNewest` → `jumpToNewest()` then the same scroll. Reserve enough right padding that tiles aren't under the strip, or overlay it at low opacity if that removes too much grid width on phones (builder's call; keep tile size computed in one place).
- [ ] **Step 3: Verify manually (seeded data, dev client):**
  - Drag along the rail to 2020: bubble tracks the finger; releasing lands at that month (or nearest earlier) and scrolling down continues older; scrolling up loads newer without a jump; "Latest" returns to the newest page.
  - Open a photo then go back after a jump: still at the same place (Task 8 focus rule).
  - Pull to refresh mid-jump while a page request is in flight: old response doesn't appear.
  - `2020-03` single-photo month is reachable by dragging; empty library shows no rail; VoiceOver/TalkBack can activate a year label.
  - A photo at `2024-12-31T17:30:00Z`: with device zone `Asia/Phnom_Penh` it's under 1 Jan 2025 and the rail's Jan 2025 jump lands on it.
- [ ] **Step 4: Run** `pnpm typecheck` — Expected: clean (from repo root, all workspaces).
- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/timeline-rail.tsx apps/mobile/app/index.tsx
git commit -m "feat(mobile): year/month rail with jump"
```

---

### Task 11: Docs and final verification

**Files:**
- Modify: `apps/web/DESIGN.md`, `apps/mobile/DESIGN.md` (short note on the day headings and rail treatment, matching how those files describe existing components); `README.md` only if it documents API endpoints (add the timeline endpoint and `dir`).

- [ ] **Step 1: Update the docs** as above.
- [ ] **Step 2: Full check:** `pnpm typecheck` from the repo root — Expected: all workspaces pass. Re-run the Review Focus scenarios end-to-end on web and mobile against the seeded library, then remove the seed rows with `--clean`.
- [ ] **Step 3: Commit**

```bash
git add apps/web/DESIGN.md apps/mobile/DESIGN.md README.md
git commit -m "docs: document the gallery timeline"
```
