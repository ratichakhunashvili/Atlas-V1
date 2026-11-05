import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { loginSchema, signupSchema } from "@/features/users/schema";

/** One account per email address whatever its letter case (migration 0026 + the sign-up/sign-in schemas). */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

describe("email addresses are case-insensitive", () => {
  it("sign-up and sign-in normalise the email to trimmed lower case", () => {
    const signup = signupSchema.parse({ name: "", email: "  Nino@Example.TEST ", password: "abcdefg1" });
    const login = loginSchema.parse({ email: "NINO@example.test", password: "x" });
    assert.equal(signup.email, "nino@example.test");
    assert.equal(login.email, "nino@example.test");
  });

  it("still rejects an invalid email after normalising", () => {
    assert.equal(loginSchema.safeParse({ email: "  NOT-AN-EMAIL ", password: "x" }).success, false);
  });

  it("the database refuses a second account that differs only in case", async () => {
    const { db, schema } = database;
    await db.insert(schema.users).values({ email: "case@example.test", passwordHash: "x" });
    const code = await expectSqlFailure(() =>
      db.execute(`insert into users (email, password_hash) values ('case@example.test ', 'x')`)
    );
    // Either the lower-case unique index or the lowercase check stops it.
    assert.ok(code === "23505" || code === "23514", `unexpected SQLSTATE ${code}`);
  });

  it("the database refuses an email stored with capitals", async () => {
    const code = await expectSqlFailure(() =>
      database.db.execute(`insert into users (email, password_hash) values ('Upper@example.test', 'x')`)
    );
    assert.equal(code, "23514");
  });
});
