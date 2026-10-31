import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { hashQrToken } from "@/services/qr";

/**
 * Database-level proof for migration 0005 and the QR credential rules. Runs against
 * an in-memory PGlite instance built from the checked-in migrations — never a remote
 * or shared database.
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

async function seedHotel(name: string) {
  const { db, schema } = database;
  const [place] = await db
    .insert(schema.places)
    .values({ name, latitude: 41.7, longitude: 44.8, category: "hotel" })
    .returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  return { place, hotel };
}

async function seedPlace(name: string) {
  const { db, schema } = database;
  const [place] = await db
    .insert(schema.places)
    .values({ name, latitude: 41.7, longitude: 44.8, category: "museum" })
    .returning();
  return place;
}

describe("migrations", () => {
  it("apply in order and produce the qr_credentials table", async () => {
    const result = await database.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    );
    const tables = (result.rows as Array<{ table_name: string }>).map((row) => row.table_name);

    assert.ok(tables.includes("qr_credentials"));
    // Legacy tables are kept, not dropped — 0005 is additive.
    assert.ok(tables.includes("hotels"));
    assert.ok(tables.includes("hotel_places"));
  });

  it("leaves hotels.qr_token in place but nullable, so no existing row is destroyed", async () => {
    const result = await database.db.execute(
      sql`select is_nullable from information_schema.columns where table_name = 'hotels' and column_name = 'qr_token'`
    );
    assert.deepEqual(result.rows, [{ is_nullable: "YES" }]);

    // A hotel can now be created without any raw token at all.
    const { hotel } = await seedHotel("Nullable token hotel");
    assert.equal(hotel.qrToken, null);
  });
});

describe("a credential is bound to one purpose and one subject", () => {
  it("accepts a hotel_entry credential pointing at a hotel", async () => {
    const { hotel } = await seedHotel("Purpose hotel");
    const [credential] = await database.db
      .insert(database.schema.qrCredentials)
      .values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: hashQrToken("hotel-entry-1") })
      .returning();

    assert.equal(credential.purpose, "hotel_entry");
    assert.equal(credential.placeId, null);
    assert.equal(credential.expiresAt, null, "approved default: no expiry");
  });

  it("rejects a hotel_entry credential that points at a Place", async () => {
    const place = await seedPlace("Wrong subject place");
    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.qrCredentials)
        .values({ purpose: "hotel_entry", placeId: place.id, tokenHash: hashQrToken("bad-1") })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("rejects a place_check_in credential that points at a hotel", async () => {
    const { hotel } = await seedHotel("Wrong subject hotel");
    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.qrCredentials)
        .values({ purpose: "place_check_in", hotelId: hotel.id, tokenHash: hashQrToken("bad-2") })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("rejects a credential with no subject at all", async () => {
    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.qrCredentials)
        .values({ purpose: "hotel_entry", tokenHash: hashQrToken("bad-3") })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("rejects a credential claiming both subjects at once", async () => {
    const { hotel } = await seedHotel("Both subjects hotel");
    const place = await seedPlace("Both subjects place");
    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.qrCredentials)
        .values({ purpose: "hotel_entry", hotelId: hotel.id, placeId: place.id, tokenHash: hashQrToken("bad-4") })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("rejects a purpose outside the allowed set", async () => {
    const { hotel } = await seedHotel("Bad purpose hotel");
    const code = await expectSqlFailure(() =>
      database.db.execute(
        sql`insert into qr_credentials (purpose, hotel_id, token_hash) values ('site_access', ${hotel.id}, ${hashQrToken("bad-5")})`
      )
    );
    assert.equal(code, CHECK_VIOLATION);
  });
});

describe("only one live credential per subject", () => {
  it("refuses a second active credential for the same hotel", async () => {
    const { hotel } = await seedHotel("Single credential hotel");
    const { db, schema } = database;

    await db
      .insert(schema.qrCredentials)
      .values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: hashQrToken("one") });

    const code = await expectSqlFailure(() =>
      db.insert(schema.qrCredentials).values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: hashQrToken("two") })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("refuses a second active credential for the same Place", async () => {
    const place = await seedPlace("Single credential place");
    const { db, schema } = database;

    await db
      .insert(schema.qrCredentials)
      .values({ purpose: "place_check_in", placeId: place.id, tokenHash: hashQrToken("place-one") });

    const code = await expectSqlFailure(() =>
      db
        .insert(schema.qrCredentials)
        .values({ purpose: "place_check_in", placeId: place.id, tokenHash: hashQrToken("place-two") })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("allows a replacement once the previous one is revoked — rotation, in one transaction", async () => {
    const { hotel } = await seedHotel("Rotating hotel");
    const { db, schema } = database;

    await db
      .insert(schema.qrCredentials)
      .values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: hashQrToken("rotate-old") });

    // Exactly the shape of db/queries/qr-credentials.ts's issueQrCredential.
    await db.transaction(async (tx) => {
      await tx
        .update(schema.qrCredentials)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.qrCredentials.hotelId, hotel.id), isNull(schema.qrCredentials.revokedAt)));

      await tx
        .insert(schema.qrCredentials)
        .values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: hashQrToken("rotate-new") });
    });

    const live = await db
      .select()
      .from(schema.qrCredentials)
      .where(and(eq(schema.qrCredentials.hotelId, hotel.id), isNull(schema.qrCredentials.revokedAt)));

    assert.equal(live.length, 1);
    assert.equal(live[0].tokenHash, hashQrToken("rotate-new"));

    // The revoked row is kept as history, not deleted.
    const all = await db.select().from(schema.qrCredentials).where(eq(schema.qrCredentials.hotelId, hotel.id));
    assert.equal(all.length, 2);
  });

  it("keeps revoked rows out of the way: several revoked credentials can coexist", async () => {
    const place = await seedPlace("Many revoked place");
    const { db, schema } = database;

    for (const value of ["r1", "r2", "r3"]) {
      await db.insert(schema.qrCredentials).values({
        purpose: "place_check_in",
        placeId: place.id,
        tokenHash: hashQrToken(value),
        revokedAt: new Date(),
      });
    }

    const rows = await db.select().from(schema.qrCredentials).where(eq(schema.qrCredentials.placeId, place.id));
    assert.equal(rows.length, 3);
  });
});

describe("the stored secret", () => {
  it("is unique across every subject, so one scanned value can only ever mean one thing", async () => {
    const { hotel } = await seedHotel("Hash collision hotel");
    const place = await seedPlace("Hash collision place");
    const { db, schema } = database;
    const shared = hashQrToken("shared-secret");

    await db.insert(schema.qrCredentials).values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: shared });

    const code = await expectSqlFailure(() =>
      db.insert(schema.qrCredentials).values({ purpose: "place_check_in", placeId: place.id, tokenHash: shared })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("is never the raw token: nothing in the stored row contains it", async () => {
    const { hotel } = await seedHotel("Hash only hotel");
    const raw = "a-very-secret-raw-token";

    const [credential] = await database.db
      .insert(database.schema.qrCredentials)
      .values({ purpose: "hotel_entry", hotelId: hotel.id, tokenHash: hashQrToken(raw) })
      .returning();

    assert.equal(JSON.stringify(credential).includes(raw), false);
  });
});

describe("deleting a subject", () => {
  it("takes its credentials with it rather than leaving a resolvable orphan", async () => {
    const place = await seedPlace("Deletable place");
    const { db, schema } = database;

    await db
      .insert(schema.qrCredentials)
      .values({ purpose: "place_check_in", placeId: place.id, tokenHash: hashQrToken("orphan-check") });

    await db.delete(schema.places).where(eq(schema.places.id, place.id));

    const rows = await db.select().from(schema.qrCredentials).where(eq(schema.qrCredentials.placeId, place.id));
    assert.deepEqual(rows, []);
  });
});
