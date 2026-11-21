import { sql } from "drizzle-orm";
import type { MediaTimeline } from "@photovault/shared";
import { db } from "@/db";
import { json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";

function validZone(tz: string | null): string {
  // Postgres reads "+05:00"/"-03" as an inverted POSIX offset, so offset forms are not zones.
  if (!tz || tz.startsWith("+") || tz.startsWith("-")) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// Month buckets (in the caller's zone), newest first. `before` is the UTC instant of the
// start of the following month, usable as an exclusive upper bound when paging a month.
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return unauthorized();

  const tz = validZone(new URL(req.url).searchParams.get("tz"));

  const query = (zone: string) => db.execute(sql`
    select
      extract(year from month_start)::int as year,
      extract(month from month_start)::int as month,
      count::int as count,
      to_char((month_start + interval '1 month') at time zone ${zone} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as before
    from (
      select date_trunc('month', taken_at at time zone 'UTC' at time zone ${zone}) as month_start, count(*) as count
      from media
      where user_id = ${user.id} and status = 'ready'
      group by 1
    ) t
    order by month_start desc
  `);

  // ICU may know a zone that the database's tzdata does not: retry once in UTC. A UTC failure is a real error.
  let result;
  try {
    result = await query(tz);
  } catch (err) {
    if (tz === "UTC") throw err;
    result = await query("UTC");
  }

  const rows = (Array.isArray(result) ? result : result.rows) as { year: number; month: number; count: number; before: string }[];
  const body: MediaTimeline = {
    buckets: rows.map((r) => ({ year: Number(r.year), month: Number(r.month), count: Number(r.count), before: r.before })),
  };
  return json(body);
}
