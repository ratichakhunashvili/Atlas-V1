import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CurrentSession } from "@/lib/authorization";
import { modelUploadRefusal } from "./upload-gate";

const account = (role: "admin" | "guest") =>
  ({ status: "signed-in", user: { id: "u1" }, account: { id: "u1", role } }) as unknown as CurrentSession;

describe("the model-upload route answers authorization before storage configuration", () => {
  it("refuses a signed-out or ended session with 401, whether or not storage is configured", () => {
    for (const configured of [true, false]) {
      assert.equal(modelUploadRefusal({ status: "signed-out" }, configured)?.status, 401);
      assert.equal(modelUploadRefusal({ status: "ended" }, configured)?.status, 401);
    }
  });

  it("refuses a signed-in guest with 403, never the 503 storage message", () => {
    const refusal = modelUploadRefusal(account("guest"), false);
    assert.equal(refusal?.status, 403);
    assert.doesNotMatch(refusal?.error ?? "", /storage/i);
    assert.equal(modelUploadRefusal(account("guest"), true)?.status, 403);
  });

  it("tells only an admin that storage is not configured, and lets an admin through when it is", () => {
    assert.equal(modelUploadRefusal(account("admin"), false)?.status, 503);
    assert.equal(modelUploadRefusal(account("admin"), true), null);
  });

  it("the route runs this gate before anything else in POST", () => {
    const route = readFileSync("src/app/api/admin/models/upload/route.ts", "utf8");
    const post = route.slice(route.indexOf("export async function POST"));
    const gate = post.indexOf("modelUploadRefusal(await currentSession(), isBlobConfigured)");
    assert.ok(gate > -1, "POST must call the gate with the current session");
    assert.ok(gate < post.indexOf("request.json()"), "the gate runs before the body is read");
    assert.ok(gate < post.indexOf("handleUploadPresigned("), "the gate runs before any token work");
    assert.doesNotMatch(post.slice(0, gate), /isBlobConfigured\)?\s*\{/, "no storage check before the gate");
  });
});
