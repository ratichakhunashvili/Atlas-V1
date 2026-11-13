import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface User {
    role: UserRole;
    /** Fingerprint of the password hash the user signed in with (lib/password-fingerprint.ts). */
    passwordVersion?: string;
    /** How the user signed in (auth/google.ts AuthMethod). */
    authMethod?: "password" | "google";
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
    /** Sign-in time in epoch milliseconds; absent on a token issued before it was introduced. */
    authTime?: number;
    /** Fingerprint of the password the session was signed in with; absent on older tokens. */
    passwordVersion?: string;
    /** How the session signed in; absent on tokens from before Google sign-in, which were all password sessions. */
    authMethod?: "password" | "google";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    /** Sign-in time in epoch milliseconds, set only when the token is created at sign-in. */
    authTime?: number;
    /** Fingerprint of the password hash at sign-in. */
    passwordVersion?: string;
    authMethod?: "password" | "google";
  }
}
