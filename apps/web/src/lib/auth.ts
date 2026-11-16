import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { APIError } from "better-auth/api";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  user: {
    additionalFields: {
      inviteCode: { type: "string", required: false, input: true },
      role: { type: "string", required: false, input: false, defaultValue: "user" },
    },
  },
  plugins: [expo(), bearer()],
  trustedOrigins: ["photovault://", "exp://"],
  databaseHooks: {
    user: {
      create: {
        // Invite-only: reject sign-up unless the invite code is valid (admin email bypasses).
        before: async (u) => {
          const isAdmin = !!adminEmail && u.email.toLowerCase() === adminEmail;
          if (isAdmin) return { data: { ...u, role: "admin", inviteCode: null } };
          const code = (u as { inviteCode?: string }).inviteCode;
          const [row] = code
            ? await db
                .select()
                .from(schema.invite)
                .where(and(eq(schema.invite.code, code), isNull(schema.invite.usedAt), gt(schema.invite.expiresAt, new Date())))
                .limit(1)
            : [];
          if (!row) throw new APIError("FORBIDDEN", { message: "Invalid or expired invite code" });
          return { data: { ...u, role: "user" } };
        },
        after: async (u) => {
          const code = (u as { inviteCode?: string | null }).inviteCode;
          if (!code) return;
          await db
            .update(schema.invite)
            .set({ usedBy: u.id, usedAt: new Date() })
            .where(and(eq(schema.invite.code, code), isNull(schema.invite.usedAt)));
        },
      },
    },
  },
});

export async function requireUser(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user ?? null;
}
