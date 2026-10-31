import { config } from "dotenv";
config({ path: ".env.local" });
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";

/*
 * ~30 FICTIONAL test places at realistic spots around Tbilisi Old Town, so the daily "choose 1 of 3" plan can be
 * tried with real walking distances. Every name starts with "[Test]": no real business is implied to partner with
 * Atlas. Idempotent (fixed ids, upserts) and refuses to run with NODE_ENV=production.
 *
 *   npx tsx scripts/seed-test-places.ts            # places, hotel relationships, featured offers
 *   npx tsx scripts/seed-test-places.ts --qr       # also (re)issues a check-in QR for each approved test place
 *
 * With --qr, the one-time codes are written ONLY to test-qr-codes.local.html (git-ignored), a page that draws them as
 * printable QR images in your browser. Re-running with --qr issues new codes and revokes the old ones.
 *
 * Hotel relationships are deliberately mixed to keep proving the eligibility rules:
 *   A / B  = active, confirmed partnership with that hotel (each hotel its own row)
 *   fA/fB  = hotel-owned facility of that hotel
 *   *      = featured by that hotel, with an offer
 *   decoys = no relationship, or a pending / suspended / expired one: must never be offered
 */

const HOTEL_A = "a71a5000-0000-4000-8000-000000002001";
const HOTEL_B = "a71a5000-0000-4000-8000-000000002002";
const DEV_ADMIN = "a71a5000-0000-4000-8000-000000000001";

type Rel = "A" | "B" | "A*" | "B*" | "fA" | "fB" | "pendingA" | "suspendedB" | "expiredA";
type Seed = { name: string; category: string; price: number | null; visit: number; lat: number; lng: number; rel: Rel[]; offer?: string; facility?: string };

const OFFERS: Record<string, string> = {
  "[Test] Old Town Khinkali House": "Free dessert for hotel guests",
  "[Test] Sulphur Bath Retreat": "15% off a private room",
  "[Test] Narikala Sunset Walk": "Small group, hotel guests skip the queue",
  "[Test] Rooftop Wine Terrace": "First glass on the house",
  "[Test] Dry Bridge Antiques": "10% off for hotel guests",
};

const PLACES: Seed[] = [
  // Food
  { name: "[Test] Old Town Khinkali House", category: "restaurant", price: 2, visit: 60, lat: 41.6919, lng: 44.8063, rel: ["A*", "B"] },
  { name: "[Test] Shardeni Street Bistro", category: "restaurant", price: 3, visit: 75, lat: 41.6917, lng: 44.8055, rel: ["A"] },
  { name: "[Test] Meidan Bakery Corner", category: "restaurant", price: 1, visit: 25, lat: 41.6912, lng: 44.8079, rel: ["A", "B"] },
  { name: "[Test] Sololaki Wine Cellar", category: "restaurant", price: 2, visit: 60, lat: 41.6897, lng: 44.8010, rel: ["B"] },
  { name: "[Test] Rustaveli Coffee Lab", category: "restaurant", price: 1, visit: 30, lat: 41.6982, lng: 44.7995, rel: ["A"] },
  { name: "[Test] Hotel A Garden Restaurant", category: "restaurant", price: 2, visit: 60, lat: 41.6936, lng: 44.8018, rel: ["fA"], facility: "dining" },
  // Culture
  { name: "[Test] Narikala Sunset Walk", category: "tour", price: 1, visit: 90, lat: 41.6879, lng: 44.8085, rel: ["A*", "B"] },
  { name: "[Test] Puppet Theatre Clock Tower Show", category: "attraction", price: 2, visit: 45, lat: 41.6955, lng: 44.8076, rel: ["A", "B*"] },
  { name: "[Test] Georgian Cooking Class", category: "activity", price: 3, visit: 120, lat: 41.6948, lng: 44.8033, rel: ["A"] },
  { name: "[Test] Bridge of Peace Photo Tour", category: "tour", price: null, visit: 40, lat: 41.6930, lng: 44.8087, rel: ["B"] },
  { name: "[Test] Polyphonic Singing Evening", category: "activity", price: 2, visit: 90, lat: 41.6966, lng: 44.8050, rel: ["pendingA"] },
  // Nature
  { name: "[Test] Botanical Garden Trail", category: "nature", price: 1, visit: 75, lat: 41.6872, lng: 44.8040, rel: ["A", "B"] },
  { name: "[Test] Leghvtakhevi Waterfall", category: "nature", price: null, visit: 30, lat: 41.6873, lng: 44.8072, rel: ["A"] },
  { name: "[Test] Rike Park Riverside", category: "nature", price: null, visit: 40, lat: 41.6927, lng: 44.8118, rel: ["B"] },
  { name: "[Test] Mtatsminda Viewpoint", category: "nature", price: 1, visit: 60, lat: 41.6950, lng: 44.7870, rel: ["A"] },
  { name: "[Test] Turtle Lake Shore", category: "beach", price: 1, visit: 90, lat: 41.7003, lng: 44.7535, rel: ["A"] },
  { name: "[Test] Tbilisi Sea Beach", category: "beach", price: 1, visit: 120, lat: 41.7700, lng: 44.8100, rel: ["A"] },
  // Wellness
  { name: "[Test] Sulphur Bath Retreat", category: "spa", price: 3, visit: 90, lat: 41.6881, lng: 44.8107, rel: ["A*", "B*"] },
  { name: "[Test] Abanotubani Public Baths", category: "spa", price: 1, visit: 60, lat: 41.6884, lng: 44.8100, rel: ["B"] },
  { name: "[Test] Hotel A Rooftop Pool", category: "spa", price: null, visit: 60, lat: 41.6935, lng: 44.8016, rel: ["fA"], facility: "pool" },
  { name: "[Test] Hotel B Wellness Studio", category: "spa", price: null, visit: 45, lat: 41.6991, lng: 44.8081, rel: ["fB"], facility: "spa" },
  // History
  { name: "[Test] Sioni Cathedral Visit", category: "historical", price: null, visit: 30, lat: 41.6925, lng: 44.8070, rel: ["A", "B"] },
  { name: "[Test] Metekhi Church Lookout", category: "landmark", price: null, visit: 30, lat: 41.6906, lng: 44.8105, rel: ["A"] },
  { name: "[Test] Anchiskhati Basilica", category: "historical", price: null, visit: 25, lat: 41.6956, lng: 44.8061, rel: ["B"] },
  { name: "[Test] Mother of Georgia Monument", category: "landmark", price: null, visit: 45, lat: 41.6866, lng: 44.8030, rel: ["expiredA"] },
  // Art
  { name: "[Test] Old Town Gallery Walk", category: "museum", price: 1, visit: 60, lat: 41.6942, lng: 44.8038, rel: ["A"] },
  { name: "[Test] Fabrika Street Art Yard", category: "museum", price: null, visit: 60, lat: 41.7101, lng: 44.8032, rel: ["A", "B"] },
  { name: "[Test] National Museum Highlights", category: "museum", price: 2, visit: 90, lat: 41.6950, lng: 44.8010, rel: ["suspendedB"] },
  // Nightlife
  { name: "[Test] Rooftop Wine Terrace", category: "nightlife", price: 3, visit: 90, lat: 41.6939, lng: 44.8091, rel: ["B*"] },
  { name: "[Test] Jazz Cellar Erekle", category: "nightlife", price: 2, visit: 120, lat: 41.6921, lng: 44.8049, rel: ["A"] },
  // Shopping
  { name: "[Test] Dry Bridge Antiques", category: "shop", price: 1, visit: 45, lat: 41.7005, lng: 44.8046, rel: ["A*", "B"] },
  { name: "[Test] Meidan Spice Market", category: "shop", price: 1, visit: 30, lat: 41.6909, lng: 44.8082, rel: ["B"] },
  // Decoys: in Atlas, near the hotels, approved by nobody.
  { name: "[Test] Unapproved Corner Cafe", category: "restaurant", price: 1, visit: 30, lat: 41.6933, lng: 44.8020, rel: [] },
  { name: "[Test] Unapproved Night Club", category: "nightlife", price: 2, visit: 120, lat: 41.6929, lng: 44.8030, rel: [] },
];

const id = (prefix: string, n: number) => `a71a5000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;

(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");
  const issueQr = process.argv.includes("--qr");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const now = new Date();
  const qrRows: { name: string; token: string }[] = [];
  try {
    await sql.begin(async (tx) => {
      for (const [i, p] of PLACES.entries()) {
        const placeId = id("4", i + 1);
        await tx`
          insert into places (id, name, description, latitude, longitude, category, visit_duration_minutes, price_level,
            price_level_source, price_level_verified_at, publication_status, published_at, verification_status, verified_at)
          values (${placeId}, ${p.name}, ${"Fictional test place for trying Atlas. Not a real business."}, ${p.lat}, ${p.lng},
            ${p.category}, ${p.visit}, ${p.price}, ${p.price ? "test fixture" : null}, ${p.price ? now : null},
            'published', ${now}, 'verified', ${now})
          on conflict (id) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
            category = excluded.category, visit_duration_minutes = excluded.visit_duration_minutes,
            price_level = excluded.price_level, price_level_source = excluded.price_level_source,
            price_level_verified_at = excluded.price_level_verified_at, updated_at = now()`;

        for (const rel of p.rel) {
          if (rel === "fA" || rel === "fB") {
            await tx`
              insert into hotel_facilities (id, hotel_id, place_id, facility_type, status)
              values (${id("5", i + 1)}, ${rel === "fA" ? HOTEL_A : HOTEL_B}, ${placeId}, ${p.facility ?? "other"}, 'active')
              on conflict (id) do update set status = 'active', facility_type = excluded.facility_type`;
            continue;
          }
          const hotel = rel.startsWith("A") || rel.endsWith("A") ? HOTEL_A : HOTEL_B;
          const featured = rel.endsWith("*");
          const status = rel.startsWith("pending") ? "pending_review" : rel.startsWith("suspended") ? "suspended" : "active";
          const confirmed = status === "pending_review" ? null : now;
          const endsAt = rel.startsWith("expired") ? new Date(now.getTime() - 86_400_000) : null;
          const startsAt = endsAt ? new Date(now.getTime() - 30 * 86_400_000) : null;
          const offer = featured ? (OFFERS[p.name] ?? null) : null;
          await tx`
            insert into hotel_partnerships (id, hotel_id, place_id, status, starts_at, ends_at, confirmed_by, confirmed_at, featured, offer_text)
            values (${id(hotel === HOTEL_A ? "6" : "7", i + 1)}, ${hotel}, ${placeId}, ${status}, ${startsAt}, ${endsAt},
              ${confirmed ? DEV_ADMIN : null}, ${confirmed}, ${featured}, ${offer})
            on conflict (hotel_id, place_id) do update set status = excluded.status, starts_at = excluded.starts_at,
              ends_at = excluded.ends_at, confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at,
              featured = excluded.featured, offer_text = excluded.offer_text, updated_at = now()`;
        }

        const approved = p.rel.some((r) => ["A", "B", "A*", "B*", "fA", "fB"].includes(r));
        if (issueQr && approved) {
          const token = randomBytes(24).toString("base64url");
          await tx`update qr_credentials set revoked_at = now() where place_id = ${placeId} and revoked_at is null`;
          await tx`
            insert into qr_credentials (purpose, place_id, token_hash, created_by_user_id)
            values ('place_check_in', ${placeId}, ${createHash("sha256").update(token, "utf8").digest("hex")}, ${DEV_ADMIN})`;
          qrRows.push({ name: p.name, token });
        }
      }
    });
  } finally {
    await sql.end();
  }

  const approvedCount = PLACES.filter((p) => p.rel.some((r) => !["pendingA", "suspendedB", "expiredA"].includes(r))).length;
  console.log(`Seeded ${PLACES.length} test places (${approvedCount} approved by at least one hotel, the rest decoys).`);

  if (issueQr) {
    const cards = qrRows
      .map(
        (row, n) => `<figure><div id="q${n}"></div><figcaption>${row.name.replace("[Test] ", "")}<code>${row.token}</code></figcaption></figure>`
      )
      .join("\n");
    const draw = qrRows.map((row, n) => `new QRCode(document.getElementById("q${n}"), { text: ${JSON.stringify(row.token)}, width: 160, height: 160 });`).join("\n");
    writeFileSync(
      "test-qr-codes.local.html",
      `<!doctype html><meta charset="utf-8"><title>Atlas test QR codes</title>
<style>body{font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
figure{margin:0;padding:12px;border:1px solid #ccc;border-radius:12px;break-inside:avoid}figcaption{margin-top:8px;font-weight:600}
code{display:block;font:11px monospace;font-weight:400;word-break:break-all;color:#555;margin-top:4px}</style>
<h1>Atlas test check-in QR codes</h1><p>Test places only. Scan with the Atlas scanner, or type the code under each one. Keep this file private.</p>
<main>${cards}</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script>${draw}</script>`
    );
    console.log(`Issued ${qrRows.length} check-in QR codes -> test-qr-codes.local.html (git-ignored; open it in a browser to print).`);
  }
})();
