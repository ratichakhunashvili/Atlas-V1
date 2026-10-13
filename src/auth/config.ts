import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/db/schema";

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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
