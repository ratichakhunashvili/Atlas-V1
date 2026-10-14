# Migrations 0002, 0003 and 0004 — review notes

Status: **written, reviewed locally, NOT applied to any database.** No remote database call, Neon branch or
migration run has been made for either file. Nothing here has been run against a real Postgres.

Files (0004 is described in its own section below):

- `src/db/migrations/0002_eligibility_partnerships_facilities.sql` (+ `meta/0002_snapshot.json`)
- `src/db/migrations/0003_place_publication_verification.sql` (+ `meta/0003_snapshot.json`)

Both are **additive**: they create tables, add columns and add constraints. Neither drops, deletes, truncates or
rewrites existing data (checked by static tests in `src/services/eligibility/guest-paths.test.ts`).

## 0002 — partnerships and facilities

- Creates `hotel_partnerships` (statuses `pending_review | active | suspended | revoked`, optional start/end dates,
  `active` requires a confirmation date, unique per hotel + Place) and `hotel_facilities` (hotel-owned, one owner per
  Place, validated `facility_type`).
- Adds `places.archived_at`.
- `place_id` foreign keys are `ON DELETE RESTRICT`, so a Place with partnership or facility history cannot be hard-deleted.
- **Data copy:** every existing `hotel_places` row is copied into `hotel_partnerships` as `pending_review`, keeping its
  priority and created date. None are active and none have a confirmation, so none is eligible for guests until an
  admin confirms it. `hotel_places` itself is left untouched.

## 0003 — Place publication and verification

- Adds `publication_status` (`draft | published`) and `verification_status` (`unverified | verified`) with their
  timestamps. Existing and new Places default to **draft / unverified**.
- Checks: a status and its timestamp must agree; an archived Place cannot be published.

## Effect once applied

Until an admin (1) publishes and verifies the relevant Places and (2) confirms each partnership or adds each hotel
facility, guests see no recommendations and the Advisor returns `no_eligible_experiences`. This is intentional.

## Read-only checks to run yourself (do not modify data)

Before applying:

```sql
SELECT count(*) AS legacy_rows FROM hotel_places;
SELECT count(*) AS places FROM places;
```

After applying 0002 (the legacy count must be unchanged and every copied row must be pending):

```sql
SELECT count(*) AS legacy_rows FROM hotel_places;
SELECT status, count(*) AS total, count(confirmed_at) AS confirmed FROM hotel_partnerships GROUP BY status;
```

After applying 0003 (every existing Place must be draft / unverified):

```sql
SELECT publication_status, verification_status, count(*) FROM places GROUP BY 1, 2;
```

## Rollback — preserve new data

New data (partnerships an admin confirms, facilities, published/verified statuses) is valuable and must not be lost.

1. **Never drop the new tables or columns, and never "undo" the migrations.** Do not delete `0002`/`0003` or their
   snapshots from the repo, and do not hand-edit them after they have been applied anywhere.
2. **Roll back the application code only**, by reverting the commit(s) that read the new tables. The tables, columns
   and rows simply stay in the database unused.
3. If the schema must change, fix it **forward** with a new migration (`0004_…`), reviewed first.
4. Keep the schema files (`src/db/schema/hotel-partnerships.ts`, `hotel-facilities.ts`, `places.ts`) in the repo even if
   the application code is reverted. Reverting them while keeping the migrations makes the next `drizzle-kit generate`
   emit `DROP` statements, and `drizzle-kit push` from an older schema could drop the new tables.
5. Any later destructive cleanup (for example dropping the frozen `hotel_places` table) needs separate, explicit approval.

**Emergency-only caveat.** The pre-eligibility application code ignores partnerships: reverting to it brings back
the behaviour where any nearby Place could be recommended, and deleting a Place that has partnership or facility rows
would return an error because of the `RESTRICT` foreign key. Prefer disabling guest-facing recommendation features
over reverting to that code.

## Not verified

Not run against Postgres: the `CHECK` constraints, the `ON CONFLICT` inference in the legacy copy, the single
transaction behaviour of the migration runner, and the `23503`/`23514` error codes arriving on `error.cause`.
Database integration tests are deferred (PGlite is deferred; no Neon branch has been created).

---

## 0004 — superseding itinerary stops (check-in revalidation phase)

File: `src/db/migrations/0004_itinerary_supersede_and_duration.sql` (+ `meta/0004_snapshot.json`). **Written for review; NOT applied to any database.**

- Adds nullable `itinerary_days.original_duration_seconds` (the estimate when the plan was generated; a repair updates
  `total_duration_seconds` to the repaired route but never this column). No backfill statement: rows created before this
  column have it NULL and the difficulty system falls back to `total_duration_seconds`, so existing behaviour is unchanged.
- Adds nullable `itinerary_stops.superseded_at` and `itinerary_stops.superseded_reason`. Nothing is dropped, deleted or rewritten;
  every existing row simply has both as NULL (an ordinary active stop).
- CHECKs: **a visited stop can never be superseded** (`superseded_at IS NULL OR visited_at IS NULL`); `superseded_at` and
  `superseded_reason` are both set or both null; reasons are `stop_unavailable`, `plan_regenerated`, `removed_unavailable`.
- Application behaviour: replaced, removed or rebuilt pending stops are *marked* superseded and kept as history. Active-plan reads
  (`listItineraryStops`, check-in, usage history) exclude superseded rows; `listAllItineraryStops` returns everything.

Read-only checks after applying (do not modify data):

```sql
SELECT count(*) FILTER (WHERE superseded_at IS NOT NULL) AS superseded, count(*) AS total FROM itinerary_stops;
-- must be 0 superseded straight after applying; later, none of the superseded rows may have visited_at set:
SELECT count(*) FROM itinerary_stops WHERE superseded_at IS NOT NULL AND visited_at IS NOT NULL; -- must be 0
```

### Rollback hazard specific to 0004 (a code-only rollback is NOT harmless once rows are superseded)

Unlike 0002/0003, once any stop has been superseded, rolling the **application code** back past this phase is dangerous:
the old code does not know about `superseded_at`, so superseded stops would reappear in the active plan and become
checkable again (including stops whose partnership was revoked), and counts such as `stop_count` would disagree with the
rows. If the code must be rolled back:

1. Do **not** drop the columns or the migration, and do not delete the rows.
2. Before running older code against a database that already has superseded rows, hide them (a reviewed, explicitly
   approved one-off) or keep this phase's reads in place; prefer a forward fix to reverting.
3. Never run `drizzle-kit push` from an older schema (it could drop the new columns and constraints).
