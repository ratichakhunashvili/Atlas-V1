/*
 * GET /api/account/export: the signed-in guest downloads their own data.
 *
 * Plain logic with its collaborators injected, so the tests can drive every branch without Next or a session:
 *  - who is asking comes ONLY from the session (currentUserId); the request carries no user id and none is read;
 *  - signed out is a 401 JSON body, not a redirect, because a download link must not save a login page as a file;
 *  - each export is counted against the user before anything is read (allowExport), so the route cannot be used to
 *    hammer the database;
 *  - the body is never cached anywhere (Cache-Control: no-store).
 */

export type AccountExportDependencies = {
  /** The signed-in user's id from the session, or null when nobody is signed in. */
  currentUserId: () => Promise<string | null>;
  /** Counts one export for this user and says whether it may go ahead. */
  allowExport: (userId: string, now: Date) => Promise<boolean>;
  /** Everything Atlas keeps about this user, or null if the account no longer exists. */
  gather: (userId: string, now: Date) => Promise<unknown | null>;
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE, ...headers },
  });
}

/** "atlas-data-2026-11-12.json": the UTC date of the export. */
export function exportFileName(now: Date): string {
  return `atlas-data-${now.toISOString().slice(0, 10)}.json`;
}

export async function handleAccountExport(deps: AccountExportDependencies, now: Date = new Date()): Promise<Response> {
  const userId = await deps.currentUserId();
  if (!userId) return json(401, { error: "Sign in to download your data." });

  if (!(await deps.allowExport(userId, now))) {
    return json(429, { error: "You have downloaded your data several times recently. Try again in an hour." }, { "Retry-After": "3600" });
  }

  const data = await deps.gather(userId, now);
  if (!data) return json(401, { error: "Sign in to download your data." });

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      ...NO_STORE,
    },
  });
}

/**
 * Per-user export limit: EXPORT_LIMIT downloads in a rolling EXPORT_WINDOW_MS. In-process memory only, so it holds per
 * server instance and resets on restart; see the route for why a database-backed limit is not wired yet.
 */
export const EXPORT_LIMIT = 5;
export const EXPORT_WINDOW_MS = 60 * 60 * 1000;

export function createInMemoryExportLimiter(limit = EXPORT_LIMIT, windowMs = EXPORT_WINDOW_MS) {
  const attempts = new Map<string, number[]>();
  return async (userId: string, now: Date): Promise<boolean> => {
    const since = now.getTime() - windowMs;
    const recent = (attempts.get(userId) ?? []).filter((at) => at > since);
    if (recent.length >= limit) {
      attempts.set(userId, recent);
      return false;
    }
    recent.push(now.getTime());
    attempts.set(userId, recent);
    return true;
  };
}
