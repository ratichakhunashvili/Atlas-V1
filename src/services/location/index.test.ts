import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { isDevelopmentOnlyPath } from "@/lib/development-route-policy";

/** The shared watch must survive one screen closing while another (the map) still uses it, and recover after a denial. */

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

let watches: { success: Success; failure: Failure }[] = [];
let pendingFixes: { success: Success; failure: Failure }[] = [];
let cleared = 0;
const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

const DENIED = { code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
const fix = (latitude: number, longitude: number) =>
  ({ coords: { latitude, longitude, accuracy: 20 }, timestamp: Date.now() }) as GeolocationPosition;

before(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (success: Success, failure: Failure) => pendingFixes.push({ success, failure }),
        watchPosition: (success: Success, failure: Failure) => {
          watches.push({ success, failure });
          return watches.length;
        },
        clearWatch: () => {
          cleared += 1;
        },
      },
    },
  });
});

beforeEach(() => {
  watches = [];
  pendingFixes = [];
  cleared = 0;
});

after(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
});

describe("locationService watch sharing", () => {
  it("starts one watch for many users and clears it only when the last one stops", async () => {
    const { locationService } = await import("./index");
    locationService.start(); // the map
    locationService.start(); // the walking-directions screen
    assert.equal(watches.length, 1);

    locationService.stop(); // directions closes
    assert.equal(cleared, 0, "the map still needs the live location");

    locationService.stop(); // the map unmounts
    assert.equal(cleared, 1);

    locationService.stop(); // an extra stop is harmless
    locationService.start();
    assert.equal(watches.length, 2, "a new user starts a fresh watch");
    locationService.stop();
  });

  it("brings the live watch back when the guest allows location after denying it", async () => {
    const { locationService } = await import("./index");
    locationService.start();
    pendingFixes.shift()?.failure(DENIED);
    watches[0].failure(DENIED);
    assert.equal(locationService.getState().status, "denied");

    const answer = locationService.requestPermission();
    pendingFixes.shift()?.success(fix(41.7, 44.8));
    assert.equal(await answer, "active");
    assert.equal(watches.length, 2, "a fresh watch replaces the one the denial killed");
    assert.equal(cleared, 1);

    watches[1].success(fix(41.71, 44.8)); // the guest walks ~1 km
    assert.equal(locationService.getState().coords?.latitude, 41.71, "the dot keeps following");
    locationService.stop();
  });

  it("resolves the permission request with a denial too, so the guest is never stuck waiting", async () => {
    const { locationService } = await import("./index");
    const answer = locationService.requestPermission();
    pendingFixes.shift()?.failure(DENIED);
    assert.equal(await answer, "denied");
  });
});

describe("turning location back on from the map", () => {
  it("links to a page guests can open in production", () => {
    const source = readFileSync("src/components/atlas-ui/map/live-missions-map.tsx", "utf8");
    const href = /href="([^"]+)"\s*\n\s*aria-label="Turn on location"/.exec(source)?.[1];
    assert.equal(href, "/profile/permissions");
    assert.equal(isDevelopmentOnlyPath(href), false);
  });
});
