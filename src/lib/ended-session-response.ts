import { isSessionCookieName } from "./sign-in-redirect";

/** Set-Cookie values that delete each Auth.js session cookie the browser sent (plain, __Secure- and chunked). */
export function clearSessionCookies(cookieNames: readonly string[], secure: boolean): string[] {
  return cookieNames
    .filter(isSessionCookieName)
    .map((name) => `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${secure || name.startsWith("__Secure-") ? "; Secure" : ""}`);
}

/** The signed-out session payload Auth.js itself returns (JSON null), with the stale session cookies cleared. */
export function endedSessionResponse(cookieNames: readonly string[], secure: boolean): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" });
  for (const cookie of clearSessionCookies(cookieNames, secure)) headers.append("Set-Cookie", cookie);
  return new Response("null", { status: 200, headers });
}
