import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { clearFocusRequest, consumeFocusRequest, isDismissKey, requestFocusAfterAction } from "./focus";

describe("isDismissKey", () => {
  it("is a plain Escape", () => {
    assert.equal(isDismissKey({ key: "Escape" }), true);
  });

  it("ignores other keys, Escape during IME composition, and Escape with a modifier", () => {
    assert.equal(isDismissKey({ key: "Enter" }), false);
    assert.equal(isDismissKey({ key: "Esc" }), false);
    assert.equal(isDismissKey({ key: "Escape", isComposing: true }), false);
    assert.equal(isDismissKey({ key: "Escape", shiftKey: true }), false);
    assert.equal(isDismissKey({ key: "Escape", ctrlKey: true }), false);
    assert.equal(isDismissKey({ key: "Escape", metaKey: true }), false);
    assert.equal(isDismissKey({ key: "Escape", altKey: true }), false);
  });
});

describe("focus requests across a server action", () => {
  beforeEach(clearFocusRequest);

  it("is consumed exactly once by the screen it names", () => {
    requestFocusAfterAction("plan", 1_000);
    assert.equal(consumeFocusRequest("plan", 2_000), true);
    assert.equal(consumeFocusRequest("plan", 2_001), false);
  });

  it("is left alone by another screen", () => {
    requestFocusAfterAction("plan", 1_000);
    assert.equal(consumeFocusRequest("map", 1_500), false);
    assert.equal(consumeFocusRequest("plan", 1_600), true);
  });

  it("expires, so a stale request never moves focus on a later visit", () => {
    requestFocusAfterAction("plan", 1_000);
    assert.equal(consumeFocusRequest("plan", 1_000 + 15_001), false);
    assert.equal(consumeFocusRequest("plan", 1_000 + 15_002), false);
  });

  it("there is nothing to consume without a request", () => {
    assert.equal(consumeFocusRequest("plan"), false);
  });
});
