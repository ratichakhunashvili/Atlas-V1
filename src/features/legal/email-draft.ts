/*
 * Keeps the email a visitor typed while they move between Sign in and Create account, so going back
 * does not wipe it. Kept in sessionStorage (this tab only, gone when it closes), never in a URL.
 * The password is never stored.
 */
const KEY = "atlas.auth.emailDraft";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readEmailDraft(storage: StorageLike | null): string {
  try {
    return storage?.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeEmailDraft(storage: StorageLike | null, email: string): void {
  try {
    if (!storage) return;
    if (email.trim()) storage.setItem(KEY, email.trim().slice(0, 254));
    else storage.removeItem(KEY);
  } catch {
    // Storage can be blocked (private windows); the form simply works without the draft.
  }
}
