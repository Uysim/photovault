import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL!;
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

// Local dev talks to a plain Postgres over TCP; deployed envs use Neon over HTTP.
export const db = (isLocal
  ? drizzlePg(url, { schema })
  : drizzleNeon(neon(url), { schema })) as ReturnType<typeof drizzleNeon<typeof schema>>;
export { schema };
