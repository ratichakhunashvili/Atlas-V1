import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { qrCameraProblem } from "./camera-problem";

function named(name: string, message = "") {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("qrCameraProblem", () => {
  it("reads named errors the way the AR camera does", () => {
    assert.equal(qrCameraProblem(named("NotAllowedError")), "denied");
    assert.equal(qrCameraProblem(named("NotFoundError")), "no_camera");
    assert.equal(qrCameraProblem(named("NotReadableError")), "busy");
    assert.equal(qrCameraProblem(named("TypeError")), "failed");
  });

  it("reads DOMExceptions", () => {
    assert.equal(qrCameraProblem(new DOMException("Permission denied", "NotAllowedError")), "denied");
  });

  it("reads the plain strings html5-qrcode sometimes rejects with", () => {
    assert.equal(qrCameraProblem("NotAllowedError: Permission denied"), "denied");
    assert.equal(qrCameraProblem("Error getting userMedia, error = NotReadableError: Could not start video source"), "busy");
    assert.equal(qrCameraProblem("NotFoundError: Requested device not found"), "no_camera");
    assert.equal(qrCameraProblem("something odd happened"), "failed");
  });

  it("treats anything else as an unknown failure, never as success", () => {
    assert.equal(qrCameraProblem(undefined), "failed");
    assert.equal(qrCameraProblem({ name: "NotAllowedError" }), "failed");
  });
});
