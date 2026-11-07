import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

/** The shared watch must survive one screen closing while another (the map) still uses it. */

let watches = 0;
let cleared = 0;
const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

before(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: () => {},
        watchPosition: () => {
          watches += 1;
          return watches;
        },
        clearWatch: () => {
          cleared += 1;
        },
      },
    },
  });
});

after(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
});

describe("locationService watch sharing", () => {
  it("starts one watch for many users and clears it only when the last one stops", async () => {
    const { locationService } = await import("./index");
    locationService.start(); // the map
    locationService.start(); // the walking-directions screen
    assert.equal(watches, 1);

    locationService.stop(); // directions closes
    assert.equal(cleared, 0, "the map still needs the live location");

    locationService.stop(); // the map unmounts
    assert.equal(cleared, 1);

    locationService.stop(); // an extra stop is harmless
    locationService.start();
    assert.equal(watches, 2, "a new user starts a fresh watch");
    locationService.stop();
  });
});
