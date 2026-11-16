import { randomBytes } from "node:crypto";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { json, unauthorized } from "@/lib/http";
import { requireUser } from "@/lib/auth";

async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  return user && (user as { role?: string }).role === "admin" ? user : null;
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return unauthorized();
  return json(await db.select().from(schema.invite).orderBy(desc(schema.invite.createdAt)).limit(50));
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();
  const code = randomBytes(9).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.insert(schema.invite).values({ code, createdBy: admin.id, expiresAt });
  return json({ code, expiresAt });
}
