import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface User {
    role: UserRole;
    /** Fingerprint of the password hash the user signed in with (lib/password-fingerprint.ts). */
    passwordVersion?: string;
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
  }
}
