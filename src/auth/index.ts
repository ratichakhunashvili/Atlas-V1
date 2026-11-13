import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/auth/password";
import { authConfig } from "@/auth/config";
import { authorizeCredentials } from "@/auth/authorize";
import { findUserByEmail } from "@/db/queries/users";

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
  ],
});
