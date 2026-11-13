import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * requireAdmin() and currentSession() are Next.js server modules (redirect, Auth.js, the database), so they are checked
 * structurally here: the behaviour that matters — a stale token saying "admin" over a database row saying "user" is
 * refused, and an ended session counts as signed out — is a property of where the role and the standing are read from.
 * The standing rule itself is tested in session-standing.test.ts and db/sessions.pglite.test.ts.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const code = stripComments(read("src/lib/authorization.ts"));
const between = (start: string, end?: string) => code.slice(code.indexOf(start), end ? code.indexOf(end) : undefined);
const currentSessionBody = between("export const currentSession", "export async function requireUser");
const requireUserBody = between("export async function requireUser", "export async function requireAdmin");
const requireAdminBody = between("export async function requireAdmin");

describe("currentSession reads the account fresh", () => {
  it("looks the account up by id in the database", () => {
    assert.match(currentSessionBody, /findUserById\(session\.user\.id\)/);
  });

  it("treats a missing account or an ended session as not signed in", () => {
    assert.match(currentSessionBody, /!account \|\|\s*sessionStanding\(/);
    // The token's sign-in time AND the password it was signed in with, against the account's current state.
    assert.match(currentSessionBody, /passwordVersion: session\.passwordVersion/);
    assert.match(currentSessionBody, /passwordVersion: passwordFingerprint\(account\.passwordHash\)/);
    assert.match(currentSessionBody, /status: "ended"/);
  });
});

describe("requireUser", () => {
  it("uses currentSession and sends an ended session to sign in with the reason", () => {
    assert.match(requireUserBody, /await currentSession\(\)/);
    // Every non-signed-in caller is redirected through signInRedirectPath (lib/sign-in-redirect.ts, tested there),
    // which adds the session-ended reason for an ended session and a same-site return path for a server action.
    assert.match(requireUserBody, /if \(current\.status !== "signed-in"\)/);
    assert.match(requireUserBody, /redirect\(\s*signInRedirectPath\(/);
    assert.match(requireUserBody, /ended: current\.status === "ended"/);
    assert.doesNotMatch(requireUserBody, /await auth\(\)/);
  });
});

describe("requireAdmin reads the role fresh", () => {
  it("uses currentSession, which reads the account row", () => {
    assert.match(requireAdminBody, /await currentSession\(\)/);
    assert.doesNotMatch(requireAdminBody, /await auth\(\)/);
  });

  it("decides from the database row, not the token's role", () => {
    assert.match(requireAdminBody, /account\.role !== "admin"/);
    assert.doesNotMatch(requireAdminBody, /user\.role !== "admin"/, "the token's role must not decide");
  });

  it("refuses when the session ended or the account no longer exists", () => {
    assert.match(requireAdminBody, /current\.status === "ended"/);
    assert.match(requireAdminBody, /current\.status !== "signed-in"/);
  });

  it("hands callers the authoritative role, not the stale one", () => {
    assert.match(requireAdminBody, /role: account\.role/);
  });
});

describe("every direct data gate uses currentSession, not a bare auth()", () => {
  for (const path of [
    "src/app/api/places/nearby/route.ts",
    "src/app/api/places/viewport/route.ts",
    "src/app/api/admin/models/upload/route.ts",
    "src/features/legal/viewer.ts",
    "src/app/(admin-auth)/admin/denied/page.tsx",
  ]) {
    it(path, () => {
      const source = read(path);
      assert.match(source, /await currentSession\(\)/);
      assert.doesNotMatch(source, /from "@\/auth"/);
    });
  }
});

describe("sign-out ends the account's sessions before clearing the cookie", () => {
  const actions = stripComments(read("src/auth/actions.ts"));
  for (const name of ["logoutAction", "adminLogoutAction"]) {
    it(name, () => {
      const body = actions.slice(actions.indexOf(`export async function ${name}`));
      const revoke = body.indexOf("await endSessionsOfSignedInAccount()");
      const signOut = body.indexOf("await signOut(");
      assert.ok(revoke >= 0 && signOut > revoke, "revocation runs first");
    });
  }
  it("records the revocation for the signed-in account", () => {
    assert.match(actions, /const session = await currentSession\(\);/);
    assert.match(actions, /if \(session\.status === "signed-in"\) await revokeUserSessions\(session\.user\.id, new Date\(\)\)/);
  });
});
