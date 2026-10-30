import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isLocalDatabaseUrl } from "./dev-seed";

/**
 * The development fixtures include an admin account whose password is published
 * in the README, so the only thing standing between `npm run db:seed:dev` and a
 * hosted database is this function. It must fail closed.
 */
describe("isLocalDatabaseUrl", () => {
  test("accepts a database on this machine", () => {
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@localhost:5432/atlas"), true);
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@127.0.0.1:5432/atlas"), true);
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@[::1]:5432/atlas"), true);
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@db.localhost:5432/atlas"), true);
  });

  test("refuses a hosted database — the case this guard exists for", () => {
    assert.equal(
      isLocalDatabaseUrl("postgresql://user:pw@ep-cool-name-123456.eu-central-1.aws.neon.tech/atlas?sslmode=require"),
      false
    );
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@db.example.com:5432/atlas"), false);
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@10.0.0.7:5432/atlas"), false);
  });

  test("refuses a host that merely contains the word localhost", () => {
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@localhost.evil.example/atlas"), false);
    assert.equal(isLocalDatabaseUrl("postgresql://user:pw@notlocalhost/atlas"), false);
  });

  test("fails closed on anything it cannot parse", () => {
    assert.equal(isLocalDatabaseUrl(""), false);
    assert.equal(isLocalDatabaseUrl("not a url"), false);
    assert.equal(isLocalDatabaseUrl("localhost:5432/atlas"), false);
  });
});
