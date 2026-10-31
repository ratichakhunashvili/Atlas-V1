import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { listRecentAuditEvents, recordAdminAudit } from "./operations/admin-audit";

/** Migration 0016 against the real migrations: the trail is append-only in the database, and secrets cannot enter it. */

const INSUFFICIENT_PRIVILEGE = "42501";
let database: TestDatabase;
let adminId: string;

before(async () => {
  database = await createTestDatabase();
  const [admin] = await database.db
    .insert(database.schema.users)
    .values({ email: "auditor@example.test", passwordHash: "x", role: "admin" })
    .returning();
  adminId = admin.id;
});

after(async () => {
  await database.close();
});

describe("the admin audit trail", () => {
  it("records who did what to which record, with the minimal before/after", async () => {
    const event = await recordAdminAudit(database.db, {
      actorUserId: adminId,
      action: "partnership.confirmed",
      targetType: "hotel_partnership",
      targetId: "11111111-1111-4111-8111-111111111111",
      hotelId: "22222222-2222-4222-8222-222222222222",
      before: { status: "pending_review" },
      after: { status: "active", priority: 1 },
    });
    assert.equal(event.actorUserId, adminId);
    assert.deepEqual(event.before, { status: "pending_review" });
    assert.deepEqual(event.after, { status: "active", priority: 1 });
  });

  it("refuses to record a secret-looking field, so tokens, hashes and passwords can never be audited", async () => {
    for (const key of ["token", "rawToken", "tokenHash", "passwordHash", "secret", "ar_reference"]) {
      await assert.rejects(
        () =>
          recordAdminAudit(database.db, {
            actorUserId: adminId,
            action: "qr_credential.issued",
            targetType: "qr_credential",
            targetId: "x",
            after: { [key]: "value" },
          }),
        /secrets never go in the audit trail/,
        key
      );
    }
  });

  it("refuses an action that is not on the audited list", async () => {
    const code = await expectSqlFailure(() =>
      database.db.execute(
        sql`insert into admin_audit_events (action, target_type, target_id) values ('place.deleted_everything', 'place', 'x')`
      )
    );
    assert.equal(code, "23514");
  });

  it("cannot be edited or deleted — not even by a direct statement", async () => {
    const event = await recordAdminAudit(database.db, {
      actorUserId: adminId,
      action: "place.archived",
      targetType: "place",
      targetId: "p-1",
    });
    const { db, schema } = database;

    assert.equal(
      await expectSqlFailure(() => db.update(schema.adminAuditEvents).set({ action: "place.published" }).where(eq(schema.adminAuditEvents.id, event.id))),
      INSUFFICIENT_PRIVILEGE
    );
    assert.equal(
      await expectSqlFailure(() => db.update(schema.adminAuditEvents).set({ actorUserId: adminId }).where(eq(schema.adminAuditEvents.id, event.id))),
      INSUFFICIENT_PRIVILEGE,
      "the actor can only ever be cleared, never reassigned"
    );
    assert.equal(
      await expectSqlFailure(() => db.delete(schema.adminAuditEvents).where(eq(schema.adminAuditEvents.id, event.id))),
      INSUFFICIENT_PRIVILEGE
    );
  });

  it("keeps the history when the acting account is deleted, clearing only the actor", async () => {
    const { db, schema } = database;
    const [leaver] = await db
      .insert(schema.users)
      .values({ email: "leaver@example.test", passwordHash: "x", role: "admin" })
      .returning();
    const event = await recordAdminAudit(db, {
      actorUserId: leaver.id,
      action: "place.created",
      targetType: "place",
      targetId: "p-2",
    });

    await db.delete(schema.users).where(eq(schema.users.id, leaver.id));

    const [after] = await db.select().from(schema.adminAuditEvents).where(eq(schema.adminAuditEvents.id, event.id));
    assert.equal(after.actorUserId, null);
    assert.equal(after.action, "place.created");
  });

  it("lists newest first and can be scoped to a hotel", async () => {
    const hotelId = "33333333-3333-4333-8333-333333333333";
    await recordAdminAudit(database.db, {
      actorUserId: adminId,
      action: "partnership.revoked",
      targetType: "hotel_partnership",
      targetId: "x",
      hotelId,
      now: new Date("2030-01-01T00:00:00Z"),
    });
    const scoped = await listRecentAuditEvents(database.db, { hotelId });
    assert.equal(scoped.length, 1);
    const all = await listRecentAuditEvents(database.db, { limit: 5 });
    assert.equal(all[0].occurredAt.toISOString(), "2030-01-01T00:00:00.000Z");
  });
});
