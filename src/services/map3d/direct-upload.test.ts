import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createFakeStorage } from "@/services/storage";
import { isOwnModelUrl, MAX_MODEL_BYTES, validateModelShape } from "./upload";

/**
 * Direct browser-to-Blob model uploads: the browser reports a URL, and the server only attaches a file that is this
 * Place's own model in Atlas's store and passes the same checks as a server-side upload.
 */

const PLACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORE = "https://abc123.public.blob.vercel-storage.com";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

describe("whose upload a URL is", () => {
  it("accepts this Place's model in a Vercel Blob store, with the random suffix", () => {
    assert.equal(isOwnModelUrl(`${STORE}/place-models/${PLACE}-Xk3pQ9.glb`, PLACE), true);
  });

  it("refuses another Place's file, another site, plain http, query strings and non-GLB paths", () => {
    assert.equal(isOwnModelUrl(`${STORE}/place-models/${OTHER}-Xk3pQ9.glb`, PLACE), false);
    assert.equal(isOwnModelUrl(`https://evil.example/place-models/${PLACE}.glb`, PLACE), false);
    assert.equal(isOwnModelUrl(`https://public.blob.vercel-storage.com.evil.example/place-models/${PLACE}.glb`, PLACE), false);
    assert.equal(isOwnModelUrl(`http://abc123.public.blob.vercel-storage.com/place-models/${PLACE}.glb`, PLACE), false);
    assert.equal(isOwnModelUrl(`${STORE}/place-models/${PLACE}.glb?x=1`, PLACE), false);
    assert.equal(isOwnModelUrl(`${STORE}/place-models/${PLACE}.exe`, PLACE), false);
    assert.equal(isOwnModelUrl("not a url", PLACE), false);
  });
});

describe("checking a file already in the store", () => {
  it("accepts a stored GLB within the size limit", () => {
    assert.equal(validateModelShape({ size: 1024, contentType: "model/gltf-binary", firstBytes: GLB }).ok, true);
  });

  it("refuses an empty, oversized, wrongly typed or non-GLB stored file", () => {
    const reason = (input: Parameters<typeof validateModelShape>[0]) => {
      const result = validateModelShape(input);
      return result.ok ? "ok" : result.reason;
    };
    assert.equal(reason({ size: 0, contentType: "model/gltf-binary", firstBytes: GLB }), "empty");
    assert.equal(reason({ size: MAX_MODEL_BYTES + 1, contentType: "model/gltf-binary", firstBytes: GLB }), "too_large");
    assert.equal(reason({ size: 1024, contentType: "application/octet-stream", firstBytes: GLB }), "wrong_content_type");
    assert.equal(reason({ size: 1024, contentType: "model/gltf-binary", firstBytes: new Uint8Array([0x4d, 0x5a, 0, 0]) }), "not_a_glb");
  });

  it("the store answers for its own files only", async () => {
    const storage = createFakeStorage();
    const stored = await storage.upload({ data: new Uint8Array(8), key: `place-models/${PLACE}.glb`, contentType: "model/gltf-binary" });
    assert.ok(stored.ok);
    assert.equal((await storage.inspect(stored.url))?.size, 8);
    assert.equal(await storage.inspect(`${STORE}/place-models/${PLACE}.glb`), null);
  });
});

describe("the upload routes guard themselves", () => {
  const route = readFileSync("src/app/api/admin/models/upload/route.ts", "utf8");
  const actions = readFileSync("src/features/place-models/actions.ts", "utf8");

  it("the token route checks the admin role from the database before issuing anything", () => {
    const before = route.slice(route.indexOf("getSignedToken"));
    assert.ok(before.indexOf("await assertAdmin()") > -1);
    assert.ok(before.indexOf("await assertAdmin()") < before.indexOf("issueSignedToken("));
    // currentSession (lib/authorization.ts) reads the account row with findUserById and refuses an ended session.
    assert.match(route, /await currentSession\(\)[\s\S]*session\.account\.role !== "admin"/);
  });

  it("the token only allows a PUT of a GLB within the size limit, at this Place's own path", () => {
    assert.match(route, /allowedContentTypes: \[\.\.\.ALLOWED_MODEL_CONTENT_TYPES\]/);
    assert.match(route, /maximumSizeInBytes: MAX_MODEL_BYTES/);
    assert.match(route, /pathname !== modelStorageKey\(place\.id\)/);
    assert.match(route, /issueSignedToken\(\{ pathname, operations: \["put"\]/);
  });

  it("attaching re-checks the admin, the URL and the stored file, and deletes a file that fails", () => {
    const attach = actions.slice(actions.indexOf("export async function attachUploadedModelAction"));
    const order = ["requireAdmin()", "isOwnModelUrl(", "storageService.inspect(", "validateModelShape(", "upsertPlaceModel("];
    const positions = order.map((needle) => attach.indexOf(needle));
    assert.ok(positions.every((position) => position > -1), positions.join(","));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, "checks must run before the row is written");
    assert.match(attach.slice(0, positions[4]), /storageService\.delete\(stored\.key\)/);
  });
});
