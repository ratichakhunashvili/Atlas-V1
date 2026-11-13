import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifyPassword } from "@/auth/password";
import { authConfig } from "@/auth/config";
import { authorizeCredentials } from "@/auth/authorize";
import { googleRefusalPath, googleSessionUser, isGoogleSignInConfigured } from "@/auth/google";
import { findUserByEmail } from "@/db/queries/users";
import { findGoogleLinkedAccount, resolveGoogleSignIn } from "@/db/queries/google-sign-in";

/*
 * Google sign-in (Phase 3) is registered only when AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are both set; Auth.js reads
 * them itself. No database adapter: the account rules are Atlas's own (db/operations/google-sign-in.ts), run in the
 * signIn callback, and the jwt callback swaps Google's id for the Atlas account id before the token is written.
 */
const googleEnabled = isGoogleSignInConfigured(process.env);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        // The rules (including the reset race) live in auth/authorize.ts, where the tests run them.
        return authorizeCredentials({ findUserByEmail, verifyPassword }, credentials);
      },
    }),
    // "select_account": a shared or hotel-lobby device never signs a guest in as whoever used Google there last.
    ...(googleEnabled ? [Google({ authorization: { params: { prompt: "select_account" } } })] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const result = await resolveGoogleSignIn(
        { sub: account.providerAccountId, email: profile?.email, emailVerified: profile?.email_verified },
        new Date()
      );
      return result.ok ? true : googleRefusalPath(result.reason);
    },
    async jwt(params) {
      if (params.user && params.account?.provider === "google") {
        const user = await googleSessionUser(findGoogleLinkedAccount, params.account.providerAccountId);
        if (!user) return null;
        return authConfig.callbacks.jwt({ ...params, user });
      }
      return authConfig.callbacks.jwt(params);
    },
  },
});
