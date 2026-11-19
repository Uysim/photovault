# Gallery timeline (design)

**Why:** The gallery is one long newest-first grid. While scrolling you can't tell what date you're in or notice when you cross into another day, and there's no way to reach an old year such as 2020 without scrolling or pressing "Load more" through everything newer. The user mostly just wants to look at their photos; the timeline should make orientation and jumping easy without getting in the way.

**Size:** Project (new server endpoint, change to the existing list endpoint, web UI, mobile UI). Applies to both web and mobile, since the product treats them as one.

## What the user sees
- **Day headings.** Photos are grouped under a heading per day, e.g. `Thu, 14 Nov 2024`. Crossing into another day is visible as a new heading. This replaces web's repeated per-tile date caption (the video duration label stays). Mobile gains headings it does not have today.
- **Sticky heading.** While scrolling, the heading of the day currently at the top stays pinned, so the date is always on screen.
- **Year/month rail** down the right edge of the gallery. It shows year labels (with month ticks between them) laid out in proportion to how many photos each period holds. Dragging along it, or tapping a label, jumps the gallery to that point; while dragging, a bubble shows the month and year under the finger or pointer. The rail also reflects the current position as you scroll.
- **After a jump** the list starts at the chosen month and continues older as you scroll down. Scrolling up loads newer items too, so the user is never stranded; the top of the rail returns to the newest photos.
- Sketch:

```
 Thu, 14 Nov 2024                      ┃ 2024
 [▢][▢][▢][▢]                          ┃  ·
 Sun, 3 Nov 2024                       ┃ 2023
 [▢][▢][▢]                             ┃  ·
 ...                                   ┃ 2020 ◀ drag or tap
```

## Goals
- Always able to tell the date of what is on screen.
- Reach any year or month in a couple of seconds on a library of thousands of items.
- Same vocabulary and behaviour on web and mobile ("Web and mobile are one product").

## Non-goals
- Filters, search, albums, map or "on this day" views.
- Per-photo EXIF re-dating or changing how `takenAt` is set.
- A virtualised web grid (web keeps its current plain grid unless the builder finds it necessary).

## Anti-goals
- The rail or headings must not crowd the photos ("the media leads; chrome recedes"): quiet, low-contrast until touched or hovered.
- A jump must never leave the user unable to get back to newer photos.

## Approaches considered
- **A. Headings only, no jump.** No backend change, but doesn't satisfy "jump to 2020". Rejected.
- **B. Headings plus a year/month rail backed by a new endpoint (chosen by the user, recommended).** Meets both needs; costs two UI implementations and bidirectional paging.
- **C. Year chips only.** Simpler, but less of a timeline and no month granularity. Rejected.

## Design

### Server
1. **`GET /api/media/timeline?tz=<IANA zone>`** (new; same auth as `/api/media`). Returns the user's `ready` media counted per month, newest first:
   `{ buckets: [{ year: 2024, month: 11, count: 132 }, …] }`.
   Months are computed in the viewer's time zone (my call, so a photo taken late on 31 Dec local time isn't filed under the wrong year): `date_trunc('month', taken_at AT TIME ZONE 'UTC' AT TIME ZONE tz)`. Invalid or missing `tz` falls back to UTC. `taken_at` is stored as UTC timestamp without zone.
2. **`GET /api/media` gains optional direction.** Existing keyset cursor `<takenAt ISO>|<id>` stays. Add `dir=newer` (default `older`): returns items strictly newer than the cursor, response still ordered newest first, with `nextCursor` pointing to continue toward newer (null when at the newest). Page size stays 60.
3. **Jump = a synthetic cursor.** To start at a month, the client asks for items strictly older than the start of the following month in the viewer's zone, using the existing cursor with an empty id (`<ISO of next month start>|`). No new list endpoint is needed. (Builder to confirm the exclusive-boundary behaviour with the existing `lt`/`eq` logic.)
4. Add the shared response type (`MediaTimeline`) to `packages/shared`. The existing `media_user_taken_idx` index should serve both queries; builder to check.

### Clients (web and mobile)
- Fetch the timeline once after sign-in and again after an upload completes or an item is deleted (counts change).
- Group the loaded items by local day for headings; day headings use the viewer's locale and time zone.
- Maintain the list as a window: initial load = newest; after a jump, replace the list with the window starting at the target; paging in both directions merges into it. Keep the current "after upload, merge page 1" behaviour working when the window is at the newest end (and don't disturb it mid-jump).
- Prepending newer items must not shift what the user is looking at (web: scroll anchoring/adjust scrollTop; mobile: `maintainVisibleContentPosition` or equivalent).
- Rail: built from `buckets`, proportional heights with a minimum tap size so tiny months stay reachable; keyboard accessible on web (arrow keys / focusable year labels); labelled for screen readers; respects platform text size on mobile. Styling follows each app's existing `DESIGN.md` (web: cloth/page/gold tokens in `globals.css`; mobile: `theme.ts`).
- Empty library: no rail, no headings.

## Settled after builder review
Answered by the existing code:
- The list order is `takenAt desc, id desc` and `/api/media` already filters to `status = ready`, same as the timeline, so counts and list agree. Cursor semantics are keyset: "strictly before `(takenAt, id)`". With an empty id the tiebreak branch never matches, so a synthetic cursor means "strictly older than this instant". `dir=newer` mirrors it ("strictly after", ordered `takenAt asc, id asc`, then reversed for the response).
- Web currently pages with a "Load more" button; mobile pages with `onEndReached`.

Calls I made (please check these):
1. **The server provides the jump boundary.** Each timeline bucket also carries `before`: the UTC ISO instant of the start of the *following* month in the given `tz`, computed in Postgres. Clients never do zone-aware month math (Hermes `Intl` is uneven); a jump just uses `before + "|"` as the cursor.
2. **Time zone** is read once per app load from `Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `UTC`. Day headings, bucket months and jumps all use that one zone. If it changes while the app is open, refetch the timeline. No stored preference.
3. **Rail position while scrolling:** take the month of the top visible loaded item and place the thumb inside that month's segment in proportion to the item's index among that month's loaded items. The sticky heading derives from loaded items only.
4. **Memory:** the window grows without trimming. Page eviction is out of scope for now.
5. **Newest end and edits mid-jump:** the window is "at the newest end" when it began from the initial load or when `dir=newer` returned a null `nextCursor`. Upload completion: merge page 1 only at the newest end; otherwise just refetch the timeline. Delete: drop the item from the window and refetch the timeline.
6. **Paging UI:** web loads older and newer pages automatically with an IntersectionObserver at the ends, keeping the "Load more" button as a fallback; mobile keeps `onEndReached` for older and uses `onStartReached`-style handling (or a header sentinel) for newer.
7. **Verification:** no test runner exists, so manual verification against a seeded multi-year library including a 31 Dec / 1 Jan boundary in a non-UTC zone. Put bucketing, grouping and cursor logic in small pure functions so tests can be added later.

## Constraints and notes for the builder
- Web page is `apps/web/src/app/page.tsx` with styles in `globals.css`; mobile gallery is `apps/mobile/app/index.tsx` (a `FlatList` with `numColumns`). Mobile's multi-column `FlatList` can't host section headers directly; the builder chooses between a flattened row model (header rows + rows of N thumbnails) and `SectionList`, as long as the sticky heading and the jump work.
- Mobile uses `expo-image` and an `api()` helper that attaches the session cookie; web uses cookie session via `fetch`.
- No schema migration is expected.
- Run `pnpm typecheck`. The repo has no test setup visible; add tests for the month-bucketing and cursor logic if a runner exists or is cheap to add, otherwise verify manually against a seeded library spanning several years and a New Year's boundary in a non-UTC zone.

## Left to the builder
- Exact visual treatment of the rail, bubble, and sticky heading within the existing design systems.
- Whether to debounce rail dragging and how aggressively to prefetch after a jump.
- Day heading wording for "Today"/"Yesterday" (optional nicety; plain dates are fine).
