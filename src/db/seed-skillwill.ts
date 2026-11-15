import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { brandedQrSvg } from "../lib/branded-qr";
import { qrLink } from "../lib/qr-links";
import { isLocalDatabaseUrl } from "./operations/dev-seed";
import { SKILLWILL_TEST_PLACES, seedSkillwillTest } from "./operations/skillwill-test";
import * as schema from "./schema";

/*
 * Adds the Skillwill test base (db/operations/skillwill-test.ts) and prints its new QR codes to a sheet.
 * Run with: npm run db:seed:skillwill -- --site=https://<site> --out=<file.html> [--live]
 *
 * A database that is not on this machine is only written with --live. The sheet holds working check-in codes: keep it
 * out of the repository and print it. Codes are issued only once; a re-run prints only codes it had to create.
 */
function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const site = arg("site");
  const out = arg("out");
  if (!site || !/^https?:\/\/[^/]+$/.test(site)) throw new Error("Pass --site=https://<host> (no trailing slash): the QR images link there.");
  if (!out || !out.endsWith(".html")) throw new Error("Pass --out=<file>.html for the printable QR sheet (outside the repository).");

  const live = !isLocalDatabaseUrl(connectionString);
  if (live && !process.argv.includes("--live")) throw new Error("Refusing: DATABASE_URL is not on this machine. Add --live to write to it.");

  const client = postgres(connectionString, { max: 1 });
  try {
    const result = await seedSkillwillTest(drizzle(client, { schema }));
    console.log(`Skillwill test base (${live ? "remote" : "local"} database):`);
    console.log(`  Skillwill hotel: ${result.hotel ? "added" : "already there"}`);
    console.log(`  Places added: ${result.places} (of ${SKILLWILL_TEST_PLACES.length})`);
    console.log(`  Pending Atlas contracts added: ${result.contracts}`);
    console.log(`  QR codes issued: ${result.codes.length}`);

    if (result.codes.length > 0) {
      const cards = await Promise.all(
        result.codes.map(async (code) => {
          const link = qrLink(site, code.kind === "hotel" ? "hotel" : "place", code.rawToken);
          const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandedQrSvg(link))}`;
          return `<div class="card"><img src="${image}" alt=""><h2>${escape(code.label)}</h2><p>${code.kind === "hotel" ? "Scan to join this hotel" : "Scan to check in here"}</p><a class="link" href="${escape(link)}">${escape(link)}</a></div>`;
        })
      );
      writeFileSync(
        out,
        `<!doctype html><meta charset="utf-8"><title>Skillwill test QR codes</title><style>body{font-family:system-ui,sans-serif;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}.card{border:1px solid #ccc;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}.card img{width:220px;height:220px}h2{font-size:17px;margin:8px 0 4px}p{margin:0;color:#555;font-size:13px}.link{display:block;margin-top:6px;font-size:10px;word-break:break-all;color:#777}</style><h1>Skillwill test QR codes</h1><p>Working codes for ${escape(site)}. Keep private; print and place each at its spot.</p><div class="grid">${cards.join("")}</div>`
      );
      console.log(`  Printable sheet: ${out}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
