import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DATA_WE_STORE, LEGAL_PENDING_NOTE, TERMS_SUMMARY } from "./copy";
import { PASSWORD_NEEDS_LETTER_MESSAGE, PASSWORD_NEEDS_NUMBER_MESSAGE, PASSWORD_TOO_SHORT_MESSAGE, signupSchema } from "@/features/users/schema";

/*
 * Guards for the legal and auth screens: no unfinished [placeholder] text, no hard-coded demo hotel,
 * real links, and the delete-account action only ever acts on the signed-in caller.
 */

const read = (path: string) => readFileSync(path, "utf8");

/** String literals and JSX text a visitor can read, with comments removed (same idea as guest-wording.test.ts). */
function visibleText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const strings = [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const jsxText = [...code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1]);
  return [...strings, ...jsxText];
}

const BRACKET_PLACEHOLDER = /\[[^\]]+\]/;
// Tailwind class tokens such as min-h-[48px] or wide:hidden are not copy: drop them before looking for placeholders.
const CLASS_TOKEN = /^[\w:!/.%-]*\[[^\]\s]*\][\w:!/.%-]*$/;
const withoutClassTokens = (text: string) => text.split(/\s+/).filter((token) => !CLASS_TOKEN.test(token)).join(" ");

const LEGAL_FILES = [
  "src/components/atlas-ui/privacy.tsx",
  "src/app/(guest)/privacy/page.tsx",
  "src/app/(guest)/privacy/delete-account/page.tsx",
  "src/app/(guest)/terms/page.tsx",
  "src/app/(guest)/welcome/page.tsx",
  "src/app/(guest)/account-deleted/page.tsx",
  "src/features/legal/copy.ts",
];

test("the terms and privacy copy has no [placeholder] text", () => {
  for (const text of [TERMS_SUMMARY, LEGAL_PENDING_NOTE, ...DATA_WE_STORE]) assert.doesNotMatch(text, BRACKET_PLACEHOLDER);
  for (const file of LEGAL_FILES) {
    for (const text of visibleText(read(file))) {
      assert.doesNotMatch(withoutClassTokens(text), BRACKET_PLACEHOLDER, `${file}: ${text}`);
    }
  }
});

test("no demo hotel name is hard-coded on welcome, privacy or terms", () => {
  for (const file of LEGAL_FILES) {
    for (const text of visibleText(read(file))) assert.doesNotMatch(text, /Hotel A\b/, `${file}: ${text}`);
  }
});

test("the consent line links to the real Terms and Privacy pages", async () => {
  const { ConsentLine } = await import("@/components/atlas-ui/auth-parts");
  const html = renderToStaticMarkup(createElement(ConsentLine));
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
});

test("sign in links to password recovery and sign up links back to sign in", () => {
  assert.match(read("src/components/atlas-ui/sign-in-form.tsx"), /to="ForgotPassword"/);
  assert.match(read("src/components/atlas-ui/sign-in-form.tsx"), /<ConsentLine \/>/);
  const signUp = read("src/components/atlas-ui/sign-up-form.tsx");
  assert.match(signUp, /Already have an account\?/);
  assert.match(signUp, /optional/);
  assert.match(signUp, /<ConsentLine \/>/);
});

test("a short password is called short, not easy to guess", () => {
  const issue = (password: string) => {
    const result = signupSchema.safeParse({ name: "", email: "a@b.co", password });
    return result.success ? null : result.error.issues[0]?.message;
  };
  assert.equal(issue("a1"), PASSWORD_TOO_SHORT_MESSAGE);
  assert.equal(issue("12345678"), PASSWORD_NEEDS_LETTER_MESSAGE);
  assert.equal(issue("abcdefgh"), PASSWORD_NEEDS_NUMBER_MESSAGE);
  assert.equal(issue("abcdefg1"), null);
  assert.doesNotMatch(PASSWORD_TOO_SHORT_MESSAGE, /easy to guess/i);
});

test("delete account acts only on the signed-in caller, never on a client-supplied id", () => {
  const source = read("src/features/users/actions.ts");
  const start = source.indexOf("export async function deleteAccountAction");
  assert.ok(start > 0);
  const body = source.slice(start);
  const signature = body.slice(0, body.indexOf("{"));
  // No form data at all: nothing the client sends can name another account.
  assert.doesNotMatch(signature, /formData|FormData/);
  assert.doesNotMatch(body, /formData/);
  // The session check comes first, and the id passed on is the session's.
  assert.ok(body.indexOf("requireUser()") > 0 && body.indexOf("requireUser()") < body.indexOf("deleteGuestAccount("));
  assert.match(body, /deleteGuestAccount\(user\.id\)/);
  // requireUser sends an unauthenticated caller away before anything else runs.
  // An ended session (signed out elsewhere, password reset) counts as unauthenticated too.
  const authorization = read("src/lib/authorization.ts");
  assert.match(authorization, /if \(current\.status !== "signed-in"\) \{\s*const \[h, c\][\s\S]*?redirect\(\s*signInRedirectPath\(/);
  assert.match(authorization, /ended: current\.status === "ended"/);
});

test("the delete-account page sends signed-out visitors to sign in with a way back", () => {
  const page = read("src/app/(guest)/privacy/delete-account/page.tsx");
  assert.match(page, /if \(!viewer\.signedIn\) redirect\(`\/login\?callbackUrl=/);
});
