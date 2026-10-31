import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeStorage, unconfiguredStorage, STORAGE_NOT_CONFIGURED_MESSAGE } from "@/services/storage";
import { MAX_MODEL_BYTES, modelStorageKey, uploadModelFile, validateModelFile } from "./upload";

const PLACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** A minimal file that starts with the GLB magic number "glTF". */
function glbBytes(length = 64): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  return bytes;
}

describe("validating a model file", () => {
  it("accepts a binary glTF", () => {
    assert.equal(validateModelFile({ bytes: glbBytes(), contentType: "model/gltf-binary" }).ok, true);
  });

  it("refuses an empty file", () => {
    const result = validateModelFile({ bytes: new Uint8Array(0), contentType: "model/gltf-binary" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "empty");
  });

  it("refuses a file over the size limit", () => {
    const result = validateModelFile({
      bytes: glbBytes(MAX_MODEL_BYTES + 1),
      contentType: "model/gltf-binary",
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "too_large");
  });

  it("accepts a file exactly at the limit", () => {
    const result = validateModelFile({ bytes: glbBytes(MAX_MODEL_BYTES), contentType: "model/gltf-binary" });
    assert.equal(result.ok, true);
  });

  it("refuses a content type the loader cannot read", () => {
    for (const type of ["image/png", "application/octet-stream", "text/html", ""]) {
      const result = validateModelFile({ bytes: glbBytes(), contentType: type });
      assert.equal(result.ok, false, `${type} must be refused`);
      assert.equal(result.ok === false && result.reason, "wrong_content_type");
    }
  });

  it("refuses a file that is not a GLB, whatever it is named or claims to be", () => {
    // An executable renamed .glb and sent with the right content type.
    const notAModel = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);

    const result = validateModelFile({ bytes: notAModel, contentType: "model/gltf-binary" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_a_glb");
  });
});

describe("where a model is stored", () => {
  it("keys by Place, so re-uploading replaces rather than accumulating", () => {
    assert.equal(modelStorageKey(PLACE_ID), `place-models/${PLACE_ID}.glb`);
  });

  it("reveals nothing about who uploaded it or when", () => {
    const key = modelStorageKey(PLACE_ID);
    assert.equal(/user|admin|\d{4}-\d{2}-\d{2}/.test(key), false);
  });
});

describe("uploading", () => {
  it("stores a valid model and returns a URL", async () => {
    const storage = createFakeStorage();

    const result = await uploadModelFile(storage, {
      placeId: PLACE_ID,
      bytes: glbBytes(),
      contentType: "model/gltf-binary",
    });

    assert.equal(result.ok, true);
    assert.equal(storage.files.has(modelStorageKey(PLACE_ID)), true);
  });

  it("never reaches storage with an invalid file", async () => {
    const storage = createFakeStorage();

    const result = await uploadModelFile(storage, {
      placeId: PLACE_ID,
      bytes: new Uint8Array([0x00, 0x01]),
      contentType: "model/gltf-binary",
    });

    assert.equal(result.ok, false);
    assert.equal(storage.files.size, 0, "validation happens before anything is written");
  });

  it("refuses honestly when no object store is configured", async () => {
    const result = await uploadModelFile(unconfiguredStorage, {
      placeId: PLACE_ID,
      bytes: glbBytes(),
      contentType: "model/gltf-binary",
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && "reason" in result && result.reason, "not_configured");
    assert.equal(
      result.ok === false && result.message,
      STORAGE_NOT_CONFIGURED_MESSAGE,
      "an admin is told what to configure, not handed a 500 or a false success"
    );
  });

  it("passes a storage failure back rather than reporting success", async () => {
    const storage = createFakeStorage({
      failWith: { ok: false, reason: "failed", message: "The upload did not complete." },
    });

    const result = await uploadModelFile(storage, {
      placeId: PLACE_ID,
      bytes: glbBytes(),
      contentType: "model/gltf-binary",
    });

    assert.equal(result.ok, false);
  });
});

describe("the default storage service", () => {
  it("reports that it is not configured, rather than pretending", () => {
    assert.equal(unconfiguredStorage.configured, false);
  });

  it("refuses deletion too, with the same explanation", async () => {
    const result = await unconfiguredStorage.delete("place-models/anything.glb");
    assert.equal(result.ok, false);
    assert.equal(result.message, STORAGE_NOT_CONFIGURED_MESSAGE);
  });
});
