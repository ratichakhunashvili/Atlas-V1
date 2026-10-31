import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { changeStaffRole, listStaffAccounts } from "./operations/staff-roles";

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

async function account(email: string, role: "user" | "admin") {
  const [row] = await database.db.insert(database.schema.users).values({ email, passwordHash: "x", role }).returning();
  return row;
}

async function roleOf(id: string) {
  const [row] = await database.db.select({ role: database.schema.users.role }).from(database.schema.users).where(eq(database.schema.users.id, id));
  return row.role;
}

describe("staff role changes", () => {
  it("promotes a guest and writes the audit entry in the same transaction", async () => {
    const actor = await account("promote-actor@example.test", "admin");
    const guest = await account("promote-target@example.test", "user");

    const result = await changeStaffRole(database.db, { actorUserId: actor.id, targetEmail: "PROMOTE-target@example.test", to: "admin" });

    assert.deepEqual(result, { ok: true, changed: true, email: "promote-target@example.test", from: "user", to: "admin" });
    assert.equal(await roleOf(guest.id), "admin");

    const events = await database.db.select().from(database.schema.adminAuditEvents).where(eq(database.schema.adminAuditEvents.targetId, guest.id));
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "staff.role_changed");
    assert.equal(events[0].actorUserId, actor.id);
    assert.deepEqual(events[0].before, { role: "user" });
    assert.deepEqual(events[0].after, { role: "admin" });
  });

  it("refuses when the actor is not currently an admin, however they got to the form", async () => {
    const notAdmin = await account("not-admin@example.test", "user");
    await account("some-admin@example.test", "admin");
    const victim = await account("escalation-target@example.test", "user");

    const result = await changeStaffRole(database.db, { actorUserId: notAdmin.id, targetEmail: "escalation-target@example.test", to: "admin" });
    assert.equal(result.ok, false);
    assert.equal(await roleOf(victim.id), "user");
  });

  it("never lets anyone change their own role", async () => {
    const actor = await account("self-actor@example.test", "admin");
    await account("self-other-admin@example.test", "admin");

    const result = await changeStaffRole(database.db, { actorUserId: actor.id, targetEmail: "self-actor@example.test", to: "user" });
    assert.deepEqual(result.ok === false && result.reason, "self_change");
    assert.equal(await roleOf(actor.id), "admin");
  });

  it("demotes another admin when more than one exists", async () => {
    const actor = await account("demote-actor@example.test", "admin");
    const other = await account("demote-target@example.test", "admin");

    const result = await changeStaffRole(database.db, { actorUserId: actor.id, targetEmail: "demote-target@example.test", to: "user" });
    assert.equal(result.ok, true);
    assert.equal(await roleOf(other.id), "user");
  });

  it("can never take the administrator count to zero", async () => {
    // Reaching zero would need an admin to demote the last admin. The actor must itself be an admin and cannot target
    // themselves, so at least the actor always remains: the last-admin guard is defence in depth behind those two.
    const { db, schema } = database;
    await db.update(schema.users).set({ role: "user" });
    const sole = await account("sole-admin@example.test", "admin");

    const selfDemotion = await changeStaffRole(db, { actorUserId: sole.id, targetEmail: sole.email, to: "user" });
    assert.equal(selfDemotion.ok, false);

    const guest = await account("guest-demoter@example.test", "user");
    const guestAttempt = await changeStaffRole(db, { actorUserId: guest.id, targetEmail: sole.email, to: "user" });
    assert.equal(guestAttempt.ok, false, "a non-admin cannot demote anyone");

    assert.equal((await listStaffAccounts(db)).length, 1);
    assert.equal(await roleOf(sole.id), "admin");
  });

  it("is a harmless no-op when the role already matches, and says so", async () => {
    const actor = await account("noop-actor@example.test", "admin");
    await account("noop-target@example.test", "user");
    const result = await changeStaffRole(database.db, { actorUserId: actor.id, targetEmail: "noop-target@example.test", to: "user" });
    assert.deepEqual(result.ok && result.changed, false);
  });

  it("reports an unknown email without leaking anything else", async () => {
    const actor = await account("unknown-actor@example.test", "admin");
    const result = await changeStaffRole(database.db, { actorUserId: actor.id, targetEmail: "nobody@example.test", to: "admin" });
    assert.deepEqual(result.ok === false && result.reason, "not_found");
  });
});
