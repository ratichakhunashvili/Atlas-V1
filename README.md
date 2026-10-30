# Atlas

Atlas is a hotel-anchored experience platform for guests who are already staying at a hotel.
A guest only ever sees facilities owned by their own hotel and external places that their
specific hotel has explicitly partnered with and an admin has confirmed. A place being nearby,
popular, or present in the database or in Mapbox does not make it eligible.

The product rules and working agreements for this project are in [CLAUDE.md](CLAUDE.md).
[AGENTS.md](AGENTS.md) notes that this Next.js version has breaking changes: read the guides in
`node_modules/next/dist/docs/` before changing framework-level code.

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · PostgreSQL with Drizzle ORM ·
Auth.js · Mapbox GL JS.

## Prerequisites

- Node.js 20.9 or newer (developed on Node 24) and npm.
- A PostgreSQL database you can safely develop against, for example a local Postgres or a
  separate Neon development branch. **Do not point local development at production data.**
- A Mapbox account, for the public (browser) token and a server token.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your private environment file. `.env.local` is git-ignored; never commit it and never
   paste its values into chat, issues, or pull requests.

   ```bash
   cp .env.example .env.local
   ```

3. Fill in `.env.local`:

   | Variable | What it is |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection string for your development database. |
   | `AUTH_SECRET` | Random secret for Auth.js. Generate one with `npx auth secret`. |
   | `NEXT_PUBLIC_MAPBOX_TOKEN` | Public Mapbox token for the browser map. Restrict it to your domains in the Mapbox dashboard. |
   | `MAPBOX_SERVER_TOKEN` | Server-side Mapbox token for routing. Keep it secret; it must never reach the browser. |
   | `ADMIN_EMAIL` | Only used by the admin seed script below. |
   | `ATLAS_DEPLOYMENT_ENV` | `local`, `development`, `qa`, `staging` or `production`. Read on the server for the no-QR test entry and for the development-only routes (`/dev`, `/demo`, `/map-preview`). Missing or unknown values **fail closed**: no test entry, and development routes are hidden whenever a non-local value is declared. `NODE_ENV` alone cannot tell staging from production, so it is not used for this. |
   | `ATLAS_TEST_ENTRY_ACCOUNTS` | Comma-separated emails allowed to open a seeded test stay without scanning a hotel QR (for example `guest@atlas.test` after `npm run db:seed:dev`). Only honoured when `ATLAS_DEPLOYMENT_ENV` is `local`/`development`/`qa`/`staging`, and only for accounts mapped to a fictional fixture hotel in code. Production always requires the hotel QR. |

4. Apply the database migrations to your **development** database:

   ```bash
   npm run db:migrate
   ```

   Migrations live in `src/db/migrations`. Review a new migration before applying it to any
   shared or production database.

5. Start the dev server and open <http://localhost:3000>:

   ```bash
   npm run dev
   ```

6. Create an account on the sign-up page, then promote it to admin (admins manage places,
   hotels, partnerships and facilities under `/admin`):

   ```bash
   npm run db:seed:admin -- you@example.com
   ```

   Or skip both steps and seed ready-made development accounts — see below.

## Development fixtures

```bash
npm run db:seed:dev
```

Creates two accounts and a small, obviously fictional catalog so the guest flow can be
used immediately. **These passwords are published here on purpose** — they belong to
throwaway local accounts, so there is never a reason to invent a secret or paste one
anywhere.

That is also why the script **refuses to run unless `DATABASE_URL` points at a database
on your own machine** (`localhost`, `127.0.0.1`, `::1`, or a `*.localhost` name), and
refuses outright when `NODE_ENV=production`. An unparseable URL counts as not local.
Seeding a hosted database would put an admin account with a public password into it, so
overriding the check needs `npm run db:seed:dev -- --allow-remote` and is your call.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@atlas.test` | `atlas-dev-admin` |
| Guest | `guest@atlas.test` | `atlas-dev-guest` |

The guest starts with an **active stay at Atlas Test Hotel A**, so no QR scan is needed
to reach the map, the experiences list or the Advisor.

The catalog is shaped to demonstrate the hotel-specific eligibility rule by hand:

| Place | Relationship | Visible to |
| --- | --- | --- |
| `[Test] Riverside Sauna` | Hotel A's own facility | Hotel A guests |
| `[Test] Partner Cafe` | Active partner of Hotel A | Hotel A guests |
| `[Test] Old Town Walking Tour` | Active partner of **both** hotels (two separate rows) | Both |
| `[Test] Unaffiliated Gallery` | None — published and verified, but partnered with nobody | **Nobody** |
| `[Test] Suspended Wine Bar` | Suspended partnership with Hotel A | **Nobody** |

If the gallery or the wine bar ever appears for either hotel, eligibility is broken.

To check the cross-hotel rule by hand, move the guest to Hotel B. That needs a hotel-entry
code, and no QR credential is seeded (see below), so issue one first:

1. Sign in as the admin, open `/admin/hotels`, and pick **Atlas Test Hotel B**.
2. Issue the hotel-entry QR. **The raw code is shown once** — copy it now.
3. Sign in as the guest and open `/checkin/<code>`.
4. Confirm the switch on the page that follows.

Hotel B's guest should then see only `[Test] Old Town Walking Tour` — not Hotel A's sauna,
and not Hotel A's cafe.

Re-running the seed is safe: every row is keyed on a stable fixture id and conflicts are
ignored, so nothing is overwritten — including the password of any real account.

No QR credentials are seeded. Raw codes are revealed exactly once, when an admin issues
them under `/admin`, and a seed script has no business printing one.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run the TypeScript compiler without emitting files. |
| `npm test` | Run the unit tests. No network and no database server: the `*.pglite.test.ts` files start an in-memory Postgres (PGlite) and apply the checked-in migrations to it. |
| `npm run db:generate` | Generate a new migration from schema changes (offline). |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL`. |
| `npm run db:studio` | Open Drizzle Studio against `DATABASE_URL`. |
| `npm run db:seed:admin -- <email>` | Grant the admin role to an existing user. |
| `npm run db:seed:dev` | Seed local development fixtures (test accounts, hotels, partners). Refuses to run in production. |

Before opening a pull request, run all of these and make sure they pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` loads `.env.local`. If you want to be certain a build cannot reach a real
database, run it with `DATABASE_URL` overridden to an unreachable address.

## Guest-flow prototype (`/demo`)

`/demo` is a mobile-first prototype of the guest journey (hotel QR landing, hotel identified from a demo
QR link, interests, free time, eligible experiences, itinerary preview). It runs entirely on typed local
fixtures in `src/prototype/fixtures.ts`: it needs no database, sign-in, Mapbox token, GPS or camera, and it
is not production data. Open <http://localhost:3000/demo> after `npm run dev`.

The prototype reuses the real hotel-specific eligibility rule (`src/services/eligibility/rules.ts`) and is
guarded by `src/prototype/isolation.test.ts`, which fails if the demo starts importing database, auth,
Mapbox, GPS or QR-scanning code.

## Project layout

```text
src/app            Routes, pages and API handlers (App Router)
src/components     Shared UI and map components
src/features       Server actions and input schemas, grouped by feature
src/services       Business logic: eligibility, advisor, routing, map, QR
src/db             Drizzle schema, queries and migrations
src/auth           Auth.js configuration
src/lib            Small shared helpers (authorization, geo, env)
```

Guest-facing recommendations must always go through `src/services/eligibility`, which derives the
hotel from the signed-in guest's own active stay. Do not query the `places` table directly for
anything a guest can see.

## Troubleshooting

- **`DATABASE_URL is not set` / `AUTH_SECRET is required`:** `.env.local` is missing or incomplete.
  Re-check step 2 and 3.
- **The map is blank:** `NEXT_PUBLIC_MAPBOX_TOKEN` is empty or restricted to a different domain.
- **Guests see an empty map:** this is expected until a signed-in guest has an active hotel stay
  and an admin has confirmed at least one partner or added a hotel facility.
