import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * requireAdmin() is a Next.js server module (redirect, Auth.js, the database), so it is checked structurally here: the
 * behaviour that matters — a stale token saying "admin" over a database row saying "user" is refused — is a property of
 * where the role is read from.
 */

const source = readFileSync(join(process.cwd(), "src/lib/authorization.ts"), "utf8");
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const code = stripComments(source);
const requireAdminBody = code.slice(code.indexOf("export async function requireAdmin"));

describe("requireAdmin reads the role fresh", () => {
  it("looks the account up by id in the database", () => {
    assert.match(requireAdminBody, /findUserById\(user\.id\)/);
  });

  it("decides from the database row, not the token's role", () => {
    assert.match(requireAdminBody, /current\.role !== "admin"/);
    assert.doesNotMatch(requireAdminBody, /user\.role !== "admin"/, "the token's role must not decide");
  });

  it("refuses when the account no longer exists", () => {
    assert.match(requireAdminBody, /!current \|\|/);
  });

  it("hands callers the authoritative role, not the stale one", () => {
    assert.match(requireAdminBody, /role: current\.role/);
  });
});
