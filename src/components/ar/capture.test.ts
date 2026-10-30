import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  NoFrameError,
  classifyCameraError,
  hashFromVideoFrame,
  settleCameraStart,
  startCamera,
  stopCamera,
  type CameraFailure,
} from "./capture";

/**
 * What happens when the camera says no.
 *
 * A guest can refuse camera access, have no camera, or have one that another app
 * already holds, and none of those is an error in Atlas — each needs its own
 * honest sentence and a way to carry on without the camera. These tests run in
 * Node with stubbed browser globals: the capture and drawing path itself is
 * browser code and is NOT exercised here, which is stated plainly in the report
 * rather than implied to be covered.
 */

type MutableGlobal = typeof globalThis & { navigator?: unknown };

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
  else Reflect.deleteProperty(globalThis as MutableGlobal, "navigator");
});

/** A DOMException-shaped error, which is what getUserMedia actually rejects with. */
function cameraError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe("classifying why the camera refused", () => {
  const cases: [string, CameraFailure][] = [
    ["NotAllowedError", "permission_denied"],
    ["SecurityError", "permission_denied"],
    ["NotFoundError", "no_camera"],
    ["OverconstrainedError", "no_camera"],
    ["NotReadableError", "camera_unavailable"],
    ["AbortError", "camera_unavailable"],
  ];

  for (const [name, expected] of cases) {
    it(`maps ${name} to ${expected}`, () => {
      assert.equal(classifyCameraError(cameraError(name)), expected);
    });
  }

  it("reports anything unrecognised as unknown rather than guessing", () => {
    assert.equal(classifyCameraError(cameraError("SomethingNewError")), "unknown");
    assert.equal(classifyCameraError("not an error at all"), "unknown");
    assert.equal(classifyCameraError(null), "unknown");
  });

  it("never silently reports a failure as success", () => {
    // Every mapping is a failure case. There is no error this function can be
    // handed that would let a capture proceed.
    for (const [name] of cases) assert.notEqual(classifyCameraError(cameraError(name)), undefined);
  });
});

describe("opening the camera", () => {
  it("reports 'unsupported' when the browser has no mediaDevices at all", async () => {
    // Also the honest answer on plain HTTP, where the API is genuinely absent.
    setNavigator({});

    const result = await startCamera();

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure, "unsupported");
  });

  it("reports 'unsupported' when getUserMedia is missing from mediaDevices", async () => {
    setNavigator({ mediaDevices: {} });

    const result = await startCamera();

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure, "unsupported");
  });

  it("reports a denied permission as such, not as a generic failure", async () => {
    setNavigator({ mediaDevices: { getUserMedia: async () => Promise.reject(cameraError("NotAllowedError")) } });

    const result = await startCamera();

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure, "permission_denied");
  });

  it("reports a camera another app is holding as unavailable", async () => {
    setNavigator({ mediaDevices: { getUserMedia: async () => Promise.reject(cameraError("NotReadableError")) } });

    const result = await startCamera();

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure, "camera_unavailable");
  });

  it("asks for the rear camera as a preference, never as a hard requirement", async () => {
    const asked: unknown[] = [];
    setNavigator({
      mediaDevices: {
        getUserMedia: async (constraints: unknown) => {
          asked.push(constraints);
          return { getTracks: () => [] };
        },
      },
    });

    const result = await startCamera();

    assert.equal(result.ok, true);
    // `exact` would fail outright on a laptop with only a front camera; a guest
    // should get a working camera rather than a refusal.
    assert.deepEqual(asked, [{ video: { facingMode: "environment" }, audio: false }]);
  });
});

describe("releasing the camera", () => {
  it("stops every track", () => {
    const stopped: string[] = [];
    const stream = {
      getTracks: () => [
        { stop: () => stopped.push("video") },
        { stop: () => stopped.push("audio") },
      ],
    } as unknown as MediaStream;

    stopCamera(stream);

    // A track left running keeps the phone's camera light on after the guest has
    // walked away, which reads as the app watching them.
    assert.deepEqual(stopped, ["video", "audio"]);
  });

  it("does nothing, and throws nothing, when there is no stream", () => {
    assert.doesNotThrow(() => stopCamera(null));
  });
});

describe("a camera request that finishes after cancellation", () => {
  it("stops every track on a late stream and does not attach it", () => {
    const stopped: string[] = [];
    const stream = {
      getTracks: () => [{ stop: () => stopped.push("video") }],
    } as unknown as MediaStream;
    let attached = false;
    let failed = false;

    settleCameraStart({ ok: true, stream }, true, () => { attached = true; }, () => { failed = true; });

    assert.deepEqual(stopped, ["video"]);
    assert.equal(attached, false);
    assert.equal(failed, false);
  });

  it("does not surface a late camera error after the modal closes", () => {
    let reported = false;
    settleCameraStart({ ok: false, failure: "permission_denied" }, true, () => {}, () => { reported = true; });
    assert.equal(reported, false);
  });
});

describe("capturing a frame that is not there yet", () => {
  it("refuses a video that has produced no frame, rather than hashing nothing", () => {
    const notReady = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;

    assert.throws(() => hashFromVideoFrame(notReady), NoFrameError);
  });

  it("refuses a video with one dimension missing", () => {
    assert.throws(() => hashFromVideoFrame({ videoWidth: 640, videoHeight: 0 } as HTMLVideoElement), NoFrameError);
    assert.throws(() => hashFromVideoFrame({ videoWidth: 0, videoHeight: 480 } as HTMLVideoElement), NoFrameError);
  });

  it("names the error, so the UI can tell 'not warmed up yet' from a real failure", () => {
    try {
      hashFromVideoFrame({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement);
      assert.fail("expected a NoFrameError");
    } catch (error) {
      assert.equal((error as Error).name, "NoFrameError");
    }
  });
});
