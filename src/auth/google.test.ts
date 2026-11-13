import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { CurrentSession } from "@/lib/authorization";
import { isPasswordSession } from "@/lib/session-standing";
import { modelUploadRefusal } from "@/features/place-models/upload-gate";
import { googleRefusalPath, isGoogleSignInConfigured, signInErrorMessage } from "./google";

/* Phase 3, Google sign-in: the switches and messages, and that admin access never comes through Google. */

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("Google sign-in is on only with both keys", () => {
  it("needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, both non-blank", () => {
    assert.equal(isGoogleSignInConfigured({}), false);
    assert.equal(isGoogleSignInConfigured({ AUTH_GOOGLE_ID: "id" }), false);
    assert.equal(isGoogleSignInConfigured({ AUTH_GOOGLE_SECRET: "secret" }), false);
    assert.equal(isGoogleSignInConfigured({ AUTH_GOOGLE_ID: " ", AUTH_GOOGLE_SECRET: "secret" }), false);
    assert.equal(isGoogleSignInConfigured({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" }), true);
  });

  it("registers the provider, and shows the button and its form, only behind that check", () => {
    const index = read("src/auth/index.ts");
    assert.match(index, /const googleEnabled = isGoogleSignInConfigured\(process\.env\);/);
    assert.match(index, /\.\.\.\(googleEnabled \? \[Google\(/);
    for (const page of ["src/app/(auth)/login/page.tsx", "src/app/(auth)/signup/page.tsx"]) {
      const source = read(page);
      assert.match(source, /const google = isGoogleSignInConfigured\(process\.env\);/, page);
      assert.match(source, /\{google \? <GoogleSignInForm callbackUrl=\{callbackUrl\} \/> : null\}/, page);
    }
    const action = read("src/auth/actions.ts");
    const body = action.slice(action.indexOf("export async function googleSignInAction"));
    assert.ok(body.indexOf("isGoogleSignInConfigured(process.env)") < body.indexOf('signIn("google"'));
    assert.match(body, /safeCallback\(formData\.get\("callbackUrl"\), "\/"\)/, "only a same-site destination");
  });

  it("is never offered on the admin sign-in screen", () => {
    const dir = "src/app/(admin-auth)";
    const files: string[] = [];
    const walk = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(path, entry.name));
        else files.push(join(path, entry.name));
      }
    };
    walk(dir);
    for (const file of files) assert.doesNotMatch(read(file), /google/i, file);
  });
});

describe("the account rules run on the server, before the token is written", () => {
  it("signIn runs the account rules and jwt swaps in the Atlas account id", () => {
    const index = read("src/auth/index.ts");
    assert.match(index, /if \(account\?\.provider !== "google"\) return true;/);
    assert.match(index, /resolveGoogleSignIn\(\s*\{ sub: account\.providerAccountId, email: profile\?\.email, emailVerified: profile\?\.email_verified \}/);
    assert.match(index, /return result\.ok \? true : googleRefusalPath\(result\.reason\);/);
    assert.match(index, /googleSessionUser\(findGoogleLinkedAccount, params\.account\.providerAccountId\)/);
    assert.match(index, /if \(!user\) return null;/);
  });
});

describe("sign-in error messages", () => {
  it("come from a short code, and an unknown code gets the general message", () => {
    assert.equal(signInErrorMessage(undefined), null);
    assert.equal(signInErrorMessage(""), null);
    for (const code of ["AccessDenied", "OAuthCallbackError", "Configuration", "anything-else", "google"]) {
      assert.equal(signInErrorMessage(code), "Google sign-in didn't work. Please try again, or sign in with your email and password.", code);
    }
    assert.match(signInErrorMessage("google_unverified") ?? "", /isn't verified/);
    assert.match(signInErrorMessage("google_admin") ?? "", /Admin accounts sign in with email and password/);
    assert.match(signInErrorMessage("google_other_account") ?? "", /different Google account/);
  });

  it("refusals redirect to the sign-in screen with a code, never an email", () => {
    for (const reason of ["invalid_profile", "email_unverified", "admin_account", "other_google_account"] as const) {
      const path = googleRefusalPath(reason);
      assert.match(path, /^\/login\?error=[a-z_]+$/, path);
      assert.notEqual(signInErrorMessage(new URL(path, "http://x").searchParams.get("error")), null);
    }
  });
});

describe("admin access is never granted through Google", () => {
  it("only a password session (or one from before Google sign-in) counts", () => {
    assert.equal(isPasswordSession("password"), true);
    assert.equal(isPasswordSession(undefined), true, "tokens from before Phase 3 were all password sessions");
    for (const method of ["google", "", null, "Password", "apple"]) assert.equal(isPasswordSession(method), false, String(method));
  });

  it("requireAdmin refuses a Google session even on an admin account", () => {
    const authorization = read("src/lib/authorization.ts");
    const requireAdmin = authorization.slice(authorization.indexOf("export async function requireAdmin"));
    assert.match(requireAdmin, /if \(account\.role !== "admin" \|\| !isPasswordSession\(current\.authMethod\)\) \{\n\s*redirect\(ADMIN_DENIED_PATH\);/);
    assert.match(authorization, /return \{ status: "signed-in", user: session\.user, account, authMethod: session\.authMethod \};/);
  });

  it("the model upload route refuses a Google session even on an admin account", () => {
    const session = (authMethod: string | undefined) =>
      ({ status: "signed-in", user: { id: "u1" }, account: { id: "u1", role: "admin" }, authMethod }) as unknown as CurrentSession;
    assert.equal(modelUploadRefusal(session("google"), true)?.status, 403);
    assert.equal(modelUploadRefusal(session("password"), true), null);
    assert.equal(modelUploadRefusal(session(undefined), true), null);
    assert.match(read("src/app/api/admin/models/upload/route.ts"), /session\.account\.role !== "admin" \|\| !isPasswordSession\(session\.authMethod\)/);
  });
});
