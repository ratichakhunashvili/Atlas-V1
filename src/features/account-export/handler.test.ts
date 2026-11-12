import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryExportLimiter, exportFileName, handleAccountExport } from "./handler";

const NOW = new Date("2026-11-12T10:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

test("the file is named after the UTC date", () => {
  assert.equal(exportFileName(new Date("2026-01-05T23:59:59Z")), "atlas-data-2026-01-05.json");
});

test("the limiter allows 5 exports per user per hour, then refuses, and recovers after the window", async () => {
  const allow = createInMemoryExportLimiter();
  for (let i = 0; i < 5; i += 1) assert.equal(await allow("a", later(i)), true);
  assert.equal(await allow("a", later(10)), false);
  // Another user has their own allowance.
  assert.equal(await allow("b", later(10)), true);
  // The first export leaves the rolling window after an hour.
  assert.equal(await allow("a", later(61)), true);
});

test("a throttled request gets 429 and reads no data", async () => {
  let read = false;
  const response = await handleAccountExport(
    { currentUserId: async () => "a", allowExport: async () => false, gather: async () => ((read = true), {}) },
    NOW
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(read, false);
});

test("the limit is checked against the session's user, never anything else", async () => {
  const seen: string[] = [];
  await handleAccountExport(
    {
      currentUserId: async () => "session-user",
      allowExport: async (userId) => (seen.push(userId), true),
      gather: async (userId) => (seen.push(userId), { ok: true }),
    },
    NOW
  );
  assert.deepEqual(seen, ["session-user", "session-user"]);
});

test("a session whose account is gone gets 401, not an empty file", async () => {
  const response = await handleAccountExport({ currentUserId: async () => "gone", allowExport: async () => true, gather: async () => null }, NOW);
  assert.equal(response.status, 401);
});
