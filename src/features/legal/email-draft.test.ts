import { test } from "node:test";
import assert from "node:assert/strict";
import { readEmailDraft, writeEmailDraft } from "./email-draft";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

test("an email typed on one screen is there on the other", () => {
  const storage = fakeStorage();
  writeEmailDraft(storage, " nino@example.com ");
  assert.equal(readEmailDraft(storage), "nino@example.com");
});

test("clearing the field clears the draft", () => {
  const storage = fakeStorage();
  writeEmailDraft(storage, "a@b.co");
  writeEmailDraft(storage, "  ");
  assert.equal(readEmailDraft(storage), "");
});

test("blocked or missing storage never throws", () => {
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readEmailDraft(blocked), "");
  assert.doesNotThrow(() => writeEmailDraft(blocked, "a@b.co"));
  assert.equal(readEmailDraft(null), "");
});
