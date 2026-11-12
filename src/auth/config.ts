import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/db/schema";
import { authTimeFor } from "@/lib/session-standing";

// Edge-safe base config: no db/bcrypt imports here. This is what proxy.ts
// uses (via its own NextAuth(authConfig) call) so the Node-only Credentials
// provider never gets bundled for the Edge runtime. src/auth/index.ts adds
// the Credentials provider on top of this for the full, Node-runtime config.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: UserRole }).role;
        // Stamped once, at sign-in, and never refreshed: sessions_valid_after (sign-out, password reset) ends every
        // token signed in before it. See lib/session-standing.ts.
        token.authTime = authTimeFor(new Date());
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      if (typeof token.authTime === "number") session.authTime = token.authTime;
      return session;
    },
  },
} satisfies NextAuthConfig;
