import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { currentSession } from "@/lib/authorization";
import { endedSessionResponse } from "@/lib/ended-session-response";

/*
 * Auth.js's own endpoints. /api/auth/session is the one exception: Auth.js would answer a signed but revoked token
 * (signed out elsewhere, password reset) with the user's identity and a refreshed cookie, because it knows nothing of
 * users.sessions_valid_after. So that path first asks Atlas's session check, and an ended session gets a signed-out
 * payload and a cleared cookie, never a refreshed one (follow-up review, 2026-11-13).
 */
export async function GET(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith("/api/auth/session")) {
    const current = await currentSession();
    if (current.status === "ended") {
      return endedSessionResponse(request.cookies.getAll().map((cookie) => cookie.name), request.nextUrl.protocol === "https:");
    }
  }
  return handlers.GET(request);
}

export const { POST } = handlers;
