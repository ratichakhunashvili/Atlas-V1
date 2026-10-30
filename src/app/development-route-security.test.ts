import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("the Proxy matcher covers /dev and /demo, and returns a real 404 in production", () => {
  const proxy = read("src/proxy.ts");
  assert.match(
    proxy,
    /shouldBlockDevelopmentOnlyPath\(pathname, process\.env\.NODE_ENV, process\.env\.ATLAS_DEPLOYMENT_ENV\)/
  );
  assert.match(proxy, /new NextResponse\(null, \{ status: 404 \}\)/);
  assert.match(proxy, /"\/dev\/:path\*"/);
  assert.match(proxy, /"\/demo\/:path\*"/);
});

test("dev check-in pages are admin-only, read existing itineraries, and never generate during render", () => {
  for (const path of [
    "src/app/(app)/dev/advisor-check-in/page.tsx",
    "src/app/(app)/dev/advisor-qr-check-in/page.tsx",
  ]) {
    const page = read(path);
    assert.match(page, /shouldBlockDevelopmentOnlyPath/);
    assert.match(page, /requireAdmin\(\)/);
    assert.match(page, /getCurrentItineraryForUser/);
    assert.doesNotMatch(page, /generateItineraryForUser|findPlaceById|qrToken/);
  }

  const explicitAction = read("src/app/(app)/dev/generate-itinerary-button.tsx");
  assert.match(explicitAction, /generateItineraryAction\(\)/);
  assert.match(explicitAction, /onClick=\{generate\}/);
});

test("database-held QR credentials are not rendered or serialized into view props", () => {
  const hotelTable = read("src/components/hotel/hotel-table.tsx");
  const hotelDetail = read("src/app/(console)/admin/hotels/[id]/page.tsx");
  const hotelForm = read("src/components/hotel/hotel-form.tsx");
  const qrDevPage = read("src/app/(app)/dev/advisor-qr-check-in/page.tsx");
  const qrDevForm = read("src/app/(app)/dev/advisor-qr-check-in/qr-check-in-test-form.tsx");
  const scenarioPage = read("src/app/(console)/admin/advisor/[tag]/page.tsx");
  const scenarioPanel = read("src/app/(console)/admin/advisor/[tag]/scenario-test-panel.tsx");

  assert.doesNotMatch(hotelTable, /\{\s*hotel\.qrToken\s*\}/);
  assert.doesNotMatch(hotelDetail, /\{\s*hotel\.qrToken\s*\}/);
  assert.match(hotelForm, /Pick<Place, "id" \| "name">/);
  assert.match(hotelDetail, /places\.map\(\(\{ id, name \}\) => \(\{ id, name \}\)\)/);

  assert.doesNotMatch(qrDevPage, /\.qrToken|stopsWithTokens/);
  assert.doesNotMatch(qrDevForm, /stopsWithTokens|stop\.qrToken|qrToken:\s*string/);

  assert.match(scenarioPage, /hasQrToken:\s*Boolean\(p\.qrToken\)/);
  assert.doesNotMatch(scenarioPage, /qrToken:\s*p\.qrToken/);
  assert.doesNotMatch(scenarioPanel, /\.qrToken|qrToken:/);
  assert.match(scenarioPanel, /testScenarioQrCheckInAction\(tag, stop\.placeId!/);
});

test("the whole /demo subtree is also blocked by its server layout in production", () => {
  const demoLayout = read("src/app/demo/layout.tsx");
  assert.match(
    demoLayout,
    /shouldBlockDevelopmentOnlyPath\("\/demo", process\.env\.NODE_ENV, process\.env\.ATLAS_DEPLOYMENT_ENV\)/
  );
  assert.match(demoLayout, /notFound\(\)/);
});
