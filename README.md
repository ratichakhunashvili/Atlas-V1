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

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run the TypeScript compiler without emitting files. |
| `npm test` | Run the unit tests (no database or network needed). |
| `npm run db:generate` | Generate a new migration from schema changes (offline). |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL`. |
| `npm run db:studio` | Open Drizzle Studio against `DATABASE_URL`. |
| `npm run db:seed:admin -- <email>` | Grant the admin role to an existing user. |

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
