import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { endActiveStay } from "@/db/operations/hotel-stays";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";

// "Finish stay" (owner request, 2026-11-16): ends only the guest's own current stay, keeps its history, and a second
// press is harmless.
describe("endActiveStay", () => {
  let database: TestDatabase;
  before(async () => {
    database = await createTestDatabase();
  });
  after(async () => {
    await database.close();
  });

  it("closes only this guest's current stay, keeps the row, and is a no-op the second time", async () => {
    const { db, schema } = database;
    const [place] = await db.insert(schema.places).values({ name: "Hotel Finish", latitude: 41.7, longitude: 44.8, category: "hotel", kind: "hotel" }).returning();
    const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
    const [guest, other] = await db.insert(schema.users).values([{ email: "finish-a@example.test" }, { email: "finish-b@example.test" }]).returning();
    await db.insert(schema.hotelStays).values([
      { userId: guest.id, hotelId: hotel.id, checkIn: new Date("2026-11-15T08:00:00Z") },
      { userId: other.id, hotelId: hotel.id, checkIn: new Date("2026-11-15T08:00:00Z") },
    ]);

    const now = new Date("2026-11-16T10:00:00Z");
    assert.ok(await endActiveStay(db, { userId: guest.id, now }));
    assert.equal(await endActiveStay(db, { userId: guest.id, now }), null, "already finished: nothing to do");

    const stays = await db.select().from(schema.hotelStays);
    const mine = stays.find((stay) => stay.userId === guest.id)!;
    const theirs = stays.find((stay) => stay.userId === other.id)!;
    assert.equal(mine.checkOut?.toISOString(), now.toISOString(), "the stay is kept, with its check-out time");
    assert.equal(theirs.checkOut, null, "another guest's stay is untouched");
  });
});
