import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
    /** Sign-in time in epoch seconds; absent on a token issued before it was introduced. */
    authTime?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    /** Sign-in time in epoch seconds, set only when the token is created at sign-in. */
    authTime?: number;
  }
}
