# Atlas project knowledge

This document is a practical handoff summary of Atlas's product rules, architecture, current implementation, accepted decisions, and known gaps. The binding project instructions remain in [`CLAUDE.md`](../CLAUDE.md); this file summarizes them alongside what is currently present in the repository.

## Product in one paragraph

Atlas is a mobile-first, hotel-anchored experience platform for people staying at a hotel. The hotel is the guest's context: Atlas may show that hotel's own eligible facilities and external experiences explicitly partnered with that same hotel. It is not a hotel-search engine, review site, generic tourism directory, or unrestricted nearby-places recommender. Its promise is: **“Tell us when you’re free. We’ll figure out what you can do.”** Georgia is the initial geographic focus.

## Non-negotiable guest eligibility rule

A guest may see only:

1. A facility owned by the hotel in the guest's valid active stay; or
2. An external Place with an explicit, currently eligible partnership with that exact hotel.

For either source, the Place must be published, verified, and not archived. Facilities must also be active. Partnerships must be active, explicitly confirmed by an authorized admin, and within their optional start/end window. Pending-review, suspended, revoked, future, expired, unpublished, unverified, archived, nearby, popular, database-only, or Mapbox-only Places are not eligible.

Each hotel-to-Place partnership is its own relationship. A Place partnered with Hotel A is not thereby partnered with Hotel B. If both hotels partner with it, both explicit rows are required. Facilities and external partnerships are separate concepts and tables.

The server-side source of truth is `src/services/eligibility/`:

- `rules.ts` contains the pure eligibility rules.
- `index.ts` resolves the guest's own valid active stay and exposes the reusable service for lists, individual Places, and map-shaped data.
- A missing or out-of-period stay returns no recommendations.
- A submitted `hotelId` or `placeId` never widens access. Optional map radius/area/category filters only narrow an already-eligible set; server radius bounds are 100 m–50 km.
- Guest-facing recommendation paths must use this boundary. Do not query Places directly for guest recommendations or recreate eligibility checks in a component/feature.

Mapbox is for map rendering and directions, not for discovering or choosing Atlas recommendations.

## Guest journey and current screens

The intended guest journey is:

```text
hotel entry QR → sign in → resolve/create the guest's stay
→ choose interests and free time → see eligible experiences
→ generate or view an itinerary → visit/check in → achievements (later)
```

Current routes/components include:

- `/demo`: isolated local-fixture prototype covering hotel QR-link identification, interests, free time, eligible experiences, and a simple itinerary preview. It uses stable typed fixtures and the shared pure eligibility rule; it is not a production response or a real QR scanner.
- `/`: signed-in Atlas application with the map/Advisor experience and hotel-entry token form/state.
- `/map-preview`: development-only sample Georgia route preview described below.
- `/login`, `/signup`: Auth.js credentials sign-in and account creation.
- `/admin`: admin pages for Places, hotels, partnerships, facilities, and Advisor testing.

The prototype fixtures include Hotel A, Hotel B, a Place partnered only with A, a Place explicitly partnered with both, a facility owned by A, and a nearby non-partner. The nearby non-partner is intentionally excluded.

## Current technical architecture

- Next.js App Router, React, strict TypeScript, Tailwind CSS.
- PostgreSQL with Drizzle ORM and checked-in SQL migrations.
- Auth.js credentials provider, bcrypt password verification, JWT sessions.
- Mapbox GL JS for the client map; server-side Mapbox routing for walking routes.
- Vercel is the intended deployment platform; Neon is an available managed PostgreSQL option, not an authorization to use a remote database.
- Unit tests use Node's test runner and `tsx` (`npm test`).

Important source areas:

| Area | Location |
|---|---|
| Pages and route handlers | `src/app/` |
| Forms/components | `src/components/` |
| Feature actions/input schemas | `src/features/` |
| Eligibility and Advisor services | `src/services/eligibility/`, `src/services/advisor/` |
| Map and routing | `src/components/map/`, `src/services/mapbox/`, `src/services/routing/` |
| Drizzle schema/queries/migrations | `src/db/` |
| Auth.js configuration | `src/auth/` |
| Local prototype | `src/prototype/`, `src/app/demo/` |

### Database model present in code

The schema includes users, Places, hotels, hotel stays, user preferences, the frozen legacy `hotel_places` table, hotel partnerships, hotel facilities, itinerary days, and itinerary stops.

- A hotel is represented by a `hotels` row referencing its canonical Place.
- `hotel_partnerships` represents an external Place's relationship with one hotel. The hotel/Place pair is unique; the relationship has status, optional dates, priority, and admin confirmation metadata.
- `hotel_facilities` represents a Place owned by one hotel, with a validated facility type (pool, spa, sauna, gym, dining, room service, event, or other) and active/inactive status.
- Places have publication and verification state and can be archived. Places referenced by partnership/facility history use `RESTRICT` deletion; archive instead. Itinerary stop snapshots preserve display/history data if a Place reference later disappears.
- `hotel_stays` has at most one open stay per user, enforced with a partial unique index.

## Itineraries, check-in, and saved history

- The Advisor creates itinerary stops only from the eligibility service. The hotel is the route origin and return point, not an automatic/filler activity.
- Itineraries may contain fewer stops than a target. With no eligible experiences, the result is `no_eligible_experiences`; no nearby substitute is invented.
- A saved itinerary is a snapshot/history. Eligibility changes do not silently rewrite it.
- Before a pending stop is checked in, the server checks the authenticated user's ownership, current stay/day, stop ordering, and current eligibility. GPS and Place-QR paths share the rule and re-check eligibility immediately before the check-in write.
- Only the current day of the guest's own active stay can be checked in. The server derives it from the stay dates and server clock. Client-supplied dates, day numbers, hotel IDs, stay IDs, and itinerary IDs cannot select a different day/stay.
- An unavailable pending stop is shown as unavailable and blocks itself and later stops; earlier available stops remain checkable. The guest must explicitly repair/remove it. Available pending stops retain their order; repair replaces only unavailable pending stops. If no replacement is available, the guest can explicitly remove the unavailable pending stop.
- Completed stops are never removed or superseded by repair/rebuild and remain history/scoring inputs. Superseded pending rows are retained, not deleted.
- After a repair, the displayed active-route duration reflects the repaired route. `original_duration_seconds` retains the generated estimate for difficulty logic.
- A small accepted race remains: an admin could revoke eligibility in the few milliseconds after the final server check and before the separate database update. Complex locking was explicitly deferred.

See [`phase-acceptance-criteria.md`](phase-acceptance-criteria.md) for the full approved check-in contract and edge cases.

## QR and authentication: current implementation versus target

Auth.js credentials authentication is present. Passwords are verified with bcrypt, sessions use JWT strategy, and protected server actions derive the user from the session.

QR hardening is a known gap and must not be described as complete:

- Hotel QR values are currently generated as UUIDs and stored directly in `hotels.qr_token`; lookup compares the submitted token directly.
- Place check-in QR values are held separately in `places.qr_token` and resolved through a different lookup path, so the hotel token does not resolve as a Place token in the current flows.
- There is not yet a purpose-specific QR-token table/record with stored token hashes, expiry, and revocation state. The current model also exposes token strings to some admin/dev views.
- The approved target is random opaque tokens, storing only hashes, with explicit purpose, expiry, and revocation checks. Hotel-entry tokens must never be valid as Place check-in tokens. No client-supplied hotel ID may determine the hotel.

Treat QR-token redesign as a separate security phase. Until then, avoid exposing token values or claiming they are hashed, expiring, revocable, or purpose-bound.

## Map and the development preview

The application has one Mapbox map instance in `AtlasMap`; subsequent Place, route, and itinerary updates update the mounted map's sources rather than recreating the map. Place groups and route/itinerary visuals use GeoJSON-backed Mapbox sources/layers. The normal map is Georgia-oriented, starts in a stable tilted view where supported, and has a 2D fallback/toggle and access to a Georgia overview; there is no hard map-bounds lock.

`/map-preview` is a separate **development-only** route:

- It returns 404 in production and is force-dynamic.
- It uses fixed, clearly labeled, made-up central-Tbilisi demo points: Demo Hotel → Stop 1 → Stop 2 → Stop 3 → Demo Hotel.
- It calls the existing Mapbox walking Directions integration in that exact order. It never draws straight-line fallback geometry and never uses Mapbox search/Places to choose stops.
- It writes no data and bypasses all production eligibility/recommendation logic by design; these are not real businesses, hotel facilities, partners, or recommendations.
- Its camera frames the sample trip; the Georgia overview and 2D/3D toggle remain available.
- The preview prefers `MAPBOX_SERVER_TOKEN`; for this development preview only it falls back to `NEXT_PUBLIC_MAPBOX_TOKEN` and displays a warning. The token value itself is not rendered to the client. Prefer a server token with Directions access for the preview.

Full product map recommendations still must be supplied by the server-side eligibility service. Mapbox's catalog is not the recommendation source.

## Migration status and data safety

Migrations `0002`, `0003`, and `0004` are present for review and are **not applied to any database** according to the current project record. No Neon branch or remote database call is authorized. PGlite and real-Place seed data are deferred; do not select or fabricate real partners as seed data.

- `0002_eligibility_partnerships_facilities.sql` adds distinct partnership/facility relationships and copies legacy `hotel_places` rows into `hotel_partnerships` as `pending_review`. It leaves `hotel_places` untouched; copied rows do not become eligible until an authorized admin confirms them. Place deletion is restricted where relationship history exists.
- `0003_place_publication_verification.sql` adds publication/verification state, defaulting Places to draft/unverified.
- `0004_itinerary_supersede_and_duration.sql` adds original route duration and stop superseding metadata/constraints. It preserves existing rows and prevents completed visits from being superseded.

Never run a migration against local/shared/remote data without explicit authorization. Application rollback must preserve new tables, columns, and admin-created data; do not drop migrations/tables/rows as a rollback. In particular, once `0004` has been applied and pending stops superseded, old application code may surface those rows as active again. Keep compatible reads or plan a reviewed forward fix; do not casually roll code back across that boundary. See [`db-migrations-0002-0003.md`](db-migrations-0002-0003.md) for detailed review and rollback notes.

## Admin and development tools

- Partnership activation is an explicit admin confirmation; adding/proposing a relationship starts at `pending_review`.
- Place publication/verification and hotel facility management are separate admin operations.
- The Advisor scenario tool creates real database rows, including active relationships, for testing. It requires admin authorization and has a server-side non-production guard. Do not enable or use it in production.
- A scenario can create/delete users, hotels, Places, stays, and itineraries; use only an isolated development database.

## Local configuration

See [`README.md`](../README.md) for the full setup. Main environment variable names from `.env.example` are:

| Variable | Use |
|---|---|
| `DATABASE_URL` | PostgreSQL connection for local development only |
| `AUTH_SECRET` | Auth.js signing/encryption secret |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public browser map token, domain restricted |
| `MAPBOX_SERVER_TOKEN` | Private server-side routing token |
| `ADMIN_EMAIL` | Admin seed script only |

Never put secrets in source control, logs, browser props, or chat. Do not configure local development against production data.

Common checks are `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Database migration/integration and browser tests are separate and must be reported accurately; the Node unit suite does not prove database behavior or browser rendering.

## Workflow and repository instructions

- Inspect the current repo and protect existing/unrelated data before changes. Do not reset or delete existing work.
- Before a major implementation phase, explain its boundary, affected files/schema, test plan, and risks; wait for approval. Implement only the approved scope, review the complete diff, report exact checks/limitations, then stop for review.
- Do not create a Neon branch, call a remote database, or apply a migration unless explicitly approved. Do not do destructive database work without separate approval.
- The root `AGENTS.md` instruction warns that this project's Next.js version has breaking changes. Before writing framework-level code, read the relevant guide under `node_modules/next/dist/docs/` from the correct package location; check deprecation notices. This does not substitute for reading project rules.
- Do not silently start broader feature work after a phase is complete.

## Current known verification limits

The latest recorded project checks reported in the task history were 409 unit tests passing, with typecheck, lint, and production build passing. This document-writing task did not rerun those commands. Database integration/migration checks have not been run because migrations remain unapplied and remote database use is prohibited. Do not treat source-level/unit tests as database proof. Automated browser coverage is not recorded as run for the sample preview; browser claims should be made only after a fresh inspection.

## Deferred or open work

- Harden QR tokens to the approved hashed, purpose-bound, expiring, revocable design.
- Apply/rehearse migrations only after explicit database approval, using a safe isolated database and a reviewed rollback/forward-fix plan.
- Choose verified pilot Places and partnerships before real-place seeding.
- Keep PGlite deferred unless explicitly revisited.
- Do not resume or broaden Mapbox work unless specifically approved; keep any preview work isolated from production eligibility.
- Any future maps, search, routes, itineraries, missions, offers, bookings, and check-ins must continue to use the same server-side eligibility boundary.
