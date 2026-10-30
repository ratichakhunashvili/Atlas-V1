import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QrCredential } from "@/db/schema";
import { resolveQrCredential, resolveScannedQrToken } from "./index";
import { extractQrToken, generateRawQrToken, hashQrToken, qrTokenHashEquals } from "./token";

const NOW = new Date("2026-10-14T12:00:00.000Z");

function credential(overrides: Partial<QrCredential> = {}): QrCredential {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    purpose: "place_check_in",
    hotelId: null,
    placeId: "22222222-2222-4222-8222-222222222222",
    tokenHash: hashQrToken("raw-token"),
    expiresAt: null,
    revokedAt: null,
    createdByUserId: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("QR token generation and hashing", () => {
  it("generates a different token every time, with enough length to be unguessable", () => {
    const first = generateRawQrToken();
    const second = generateRawQrToken();
    assert.notEqual(first, second);
    // 32 random bytes in base64url — 43 characters, no padding.
    assert.equal(first.length, 43);
    assert.match(first, /^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically, so a scan resolves by a single indexed lookup", () => {
    assert.equal(hashQrToken("raw-token"), hashQrToken("raw-token"));
    assert.notEqual(hashQrToken("raw-token"), hashQrToken("raw-token2"));
  });

  it("never returns the raw token from its hash — the hash is not the token", () => {
    const raw = generateRawQrToken();
    const hash = hashQrToken(raw);
    assert.notEqual(hash, raw);
    assert.equal(hash.length, 64);
  });

  it("ignores surrounding whitespace, which scanners and manual entry both add", () => {
    assert.equal(hashQrToken("  raw-token \n"), hashQrToken("raw-token"));
  });

  it("compares hashes without leaking a length mismatch as a throw", () => {
    assert.equal(qrTokenHashEquals("abc", "abc"), true);
    assert.equal(qrTokenHashEquals("abc", "abcd"), false);
  });

  it("unwraps a token from a scanned check-in URL, and leaves a bare token alone", () => {
    assert.equal(extractQrToken("https://atlas.example/checkin/abc123"), "abc123");
    assert.equal(extractQrToken("https://atlas.example/checkin/abc123?utm=qr"), "abc123");
    assert.equal(extractQrToken("abc123"), "abc123");
    assert.equal(extractQrToken("  abc123  "), "abc123");
  });
});

describe("credential resolution rules", () => {
  it("accepts a live credential of the expected purpose", () => {
    const result = resolveQrCredential(credential(), "place_check_in", NOW);
    assert.equal(result.ok, true);
  });

  it("refuses a hotel-entry credential presented for a Place check-in", () => {
    const hotelEntry = credential({ purpose: "hotel_entry", hotelId: "33333333-3333-4333-8333-333333333333", placeId: null });
    const result = resolveQrCredential(hotelEntry, "place_check_in", NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_purpose");
  });

  it("refuses a Place check-in credential presented as a hotel entry", () => {
    const result = resolveQrCredential(credential(), "hotel_entry", NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_purpose");
  });

  it("refuses a revoked credential", () => {
    const result = resolveQrCredential(credential({ revokedAt: new Date("2026-10-10T00:00:00.000Z") }), "place_check_in", NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "revoked");
  });

  it("refuses an expired credential", () => {
    const result = resolveQrCredential(credential({ expiresAt: new Date(NOW.getTime() - 1) }), "place_check_in", NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "expired");
  });

  it("accepts a credential exactly at its expiry instant — the boundary is inclusive", () => {
    const result = resolveQrCredential(credential({ expiresAt: NOW }), "place_check_in", NOW);
    assert.equal(result.ok, true);
  });

  it("accepts a credential with no expiry, the approved default", () => {
    const result = resolveQrCredential(credential({ expiresAt: null }), "place_check_in", NOW);
    assert.equal(result.ok, true);
  });

  it("refuses an unknown credential", () => {
    const result = resolveQrCredential(null, "place_check_in", NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_found");
  });
});

describe("resolving a scanned token end to end", () => {
  const stored = credential();
  const lookup = async (tokenHash: string) => (tokenHash === stored.tokenHash ? stored : null);

  it("looks the credential up by HASH — the raw token is never used as a key", async () => {
    const seen: string[] = [];
    await resolveScannedQrToken("raw-token", "place_check_in", async (hash) => {
      seen.push(hash);
      return stored;
    }, NOW);

    assert.deepEqual(seen, [hashQrToken("raw-token")]);
    assert.equal(seen[0].includes("raw-token"), false);
  });

  it("resolves a valid scan", async () => {
    const result = await resolveScannedQrToken("raw-token", "place_check_in", lookup, NOW);
    assert.equal(result.ok, true);
  });

  it("resolves a scanned URL as well as a bare token", async () => {
    const result = await resolveScannedQrToken("https://atlas.example/checkin/raw-token", "place_check_in", lookup, NOW);
    assert.equal(result.ok, true);
  });

  it("refuses an unknown token without telling the scanner anything else", async () => {
    const result = await resolveScannedQrToken("not-a-real-token", "place_check_in", lookup, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_found");
  });

  it("refuses empty input without hitting the database", async () => {
    let calls = 0;
    const result = await resolveScannedQrToken("   ", "place_check_in", async () => {
      calls += 1;
      return stored;
    }, NOW);

    assert.equal(result.ok, false);
    assert.equal(calls, 0);
  });

  it("enforces the purpose the CALLING FLOW requires, not one taken from the scan", async () => {
    const result = await resolveScannedQrToken("raw-token", "hotel_entry", lookup, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_purpose");
  });
});

describe("the formats the entry and admin flows must accept", () => {
  it("accepts a freshly generated token through the hotel-entry input schema", async () => {
    const { checkInTokenSchema } = await import("@/features/hotel-stays/schema");

    // The old hotel tokens were UUIDs; these are 43-character base64url strings.
    // A format-bound schema here would refuse every code this layer issues.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const parsed = checkInTokenSchema.safeParse({ token: generateRawQrToken() });
      assert.equal(parsed.success, true);
    }
  });

  it("still refuses an empty hotel-entry token", async () => {
    const { checkInTokenSchema } = await import("@/features/hotel-stays/schema");
    assert.equal(checkInTokenSchema.safeParse({ token: "   " }).success, false);
  });

  it("refuses a non-uuid subject id in the admin credential schema", async () => {
    const { credentialSubjectSchema } = await import("@/features/qr-credentials/schema");
    assert.equal(credentialSubjectSchema.safeParse({ id: "not-a-uuid" }).success, false);
    assert.equal(
      credentialSubjectSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111" }).success,
      true
    );
  });
});
