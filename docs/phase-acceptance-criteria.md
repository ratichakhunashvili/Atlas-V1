# Phase acceptance criteria (decisions carried forward)

These are binding decisions recorded so they are not lost between phases. See also `CLAUDE.md`.

## Planned check-in phase — REQUIRED acceptance criterion: eligibility revalidation

Decision (approved): saved itineraries are **history**; eligibility is re-checked **when a guest acts**, not by
silently rewriting their plan.

1. **History is preserved.** Saved itinerary stop snapshots (name, category, coordinates, image) and **completed
   visits** are never altered, hidden or deleted because a partnership or facility later becomes ineligible.
2. **Revalidate server-side on every check-in.** Before a **pending** (unvisited) stop can be checked in by **GPS or
   QR**, the server must re-run eligibility for the authenticated guest's own valid active stay (via
   `services/eligibility`, e.g. `getEligibleExperienceForGuest`). If the stop's Place is no longer eligible
   (partnership suspended / revoked / expired, facility inactive, Place unpublished / unverified / archived, or the
   guest's stay is no longer valid), the check-in is **refused** with a clear "unavailable" result. No client-supplied
   hotel, place or stop id may bypass this.
3. **Show it as unavailable.** The itinerary read model must mark such a pending stop as **unavailable** (distinct
   from upcoming / current / completed) with a plain-language explanation. It must not be offered as the current stop.
4. **Explicit regeneration only.** The guest may explicitly choose to regenerate. The route must **never** change
   silently. Because generation has a 24-hour cooldown, an unavailable pending stop must allow the explicit
   regenerate action (the cooldown must not trap a guest on a plan they cannot complete).
5. **Completed stops stay completed** and remain in the saved itinerary after regeneration of the remaining plan, per
   the product's regeneration rules; the design for that must be agreed in the phase plan before implementation.
6. **Required tests** (unit, injected fakes): GPS and QR check-in refused for each ineligibility cause above; a
   completed stop is unaffected by the same causes; a stop of another hotel / another guest is never accepted; the
   read model reports `unavailable` without mutating anything; regenerate is permitted despite the cooldown only when
   a pending stop is unavailable; no route change occurs without the explicit action.

## Check-in revalidation: implemented design (pending review)

Status: implemented and unit-tested; **database integration and browser checks have not been run.** Migration
`0004` is written for review only and has not been applied to any database.

- **Which day can be checked in: only the guest's CURRENT day.** The server computes the current day number from the
  guest's own stay (`calculateDayNumber(stay.checkIn, stay.checkOut, now)` with the server clock) and a stop can be acted
  on only if its day is exactly that day of exactly that stay and hotel (`evaluateDayCheckIn`). An earlier day (even of
  the same stay), a future day, another stay, another hotel, a day with no stay, or a guest with no valid stay is
  refused with **no write**: `wrong_day` for an earlier/future day, `stop_unavailable` otherwise. After midnight
  yesterday's route is no longer checkable. **No client-supplied date, day number, "now", day id or stay id is ever
  read** (action signatures and schemas contain none; guard-tested). Completed stops of earlier days are history: they
  are not re-evaluated and re-submitting one is the existing idempotent success with no write.
- **One shared check** — `src/services/advisor/stop-availability.ts`. A pending stop is available only if the guest has a
  valid active stay, the stop's day belongs to *that* stay (`day.hotelStayId`) and is its current day, the stop still
  points at a Place, and that Place is in the hotel's eligible set (`services/eligibility`). Completed stops are never
  re-evaluated.
- **GPS and QR check-in** evaluate availability early (to decide) and **again as the last step before the write**.
  Order: ownership -> already-visited (idempotent) -> current-day check -> availability -> stop order ->
  coordinates/QR match -> fresh re-check (availability **and** day) -> write.
- **Stop order is kept.** An unavailable stop blocks itself (`stop_unavailable`) and every later stop (`stop_not_next`
  with `blockedByUnavailableStop`); earlier available stops stay checkable.
- **Directions** to a pending unavailable stop are refused (`services/advisor/directions-to-stop.ts`).
- **Read model** (`getCurrentItineraryForUser`): status `unavailable`, `currentStop = null` while the first pending stop is
  unavailable, `hasUnavailableStops`, `blockedByUnavailableStop`. Read-only; positions are the index in the active plan.
- **Explicit plan repair** (`services/advisor/plan-repair.ts`), reachable only through two dedicated server actions:
  - `replaceUnavailableStopsAction()` — takes no client input. Replaces **only** unavailable pending stops; retained
    stops keep their order and a replacement takes the vacated slot. Route = fixed-order Directions route
    (`getWalkingRouteInOrder`), never the optimizer. Refuses with `nothing_to_regenerate` when no pending stop is
    unavailable. Ordinary Generate is unchanged and never touches an existing day inside the cooldown.
  - `removeUnavailableStopAction(stopId)` — when no replacement exists. Re-checks ownership, pending, active and
    currently unavailable; never removes a completed stop.
- **History is never deleted.** Replaced/removed/rebuilt pending stops are **superseded** (`superseded_at`,
  `superseded_reason`), not deleted. A database CHECK forbids superseding a visited stop. In *every* rebuild path
  (including the admin bypass and an expired cooldown) completed stops stay in the active plan untouched; only pending
  stops are superseded. Completed visits keep counting in scoring history; superseded unvisited stops do not.
- **Durations.** `total_duration_seconds` is the walking time of the **active route** and is what the guest sees: a
  replacement or removal updates it to the repaired route's time (rounded to whole seconds), or clears it when no route
  remains. The estimate made when the plan was generated is kept separately in `original_duration_seconds`, which a repair
  never touches; a new plan (new day or full rebuild) sets both. The difficulty ratchet reads
  `original_duration_seconds ?? total_duration_seconds`, so a repair cannot skew it and older rows behave as before.

### Accepted limitation: the concurrent-revocation race

Eligibility is re-checked immediately before the check-in write, but the check and the `UPDATE` are separate statements.
If an admin revokes a partnership in the few milliseconds between them, that single check-in can still be recorded. Making
it atomic would need locking across partnership rows (or a joined, conditional UPDATE), which is disproportionate for this
phase. The stop is immediately shown as unavailable afterwards, and the visit is recorded history, not a recommendation.

### Open items (flagged, not fixed here)

- A day whose every stop was removed has no stops left; ordinary Generate still returns that day unchanged inside the
  cooldown (no extra cooldown exception was added). An admin can still rebuild it.
- ~~A pending stop from an earlier day of the current stay can be checked in by id~~ — **resolved**: only the current day
  is checkable (see above).
- Superseded rows are not yet shown in any guest-facing history screen; `listAllItineraryStops` exists for it.

## Standing constraints (until the user lifts them)

- **No Neon branch, no remote database calls, no migrations applied remotely** without explicit approval.
  Migrations `0002` and `0003` stay available for review (`docs/db-migrations-0002-0003.md`).
- **PGlite is approved for local automated database tests only.** No Neon, remote database calls or remote migrations; report any unrun checks honestly.
- **No seed of real Places** until verified pilot data is selected. Prototype fixtures only.
- **Test fixtures use stable IDs** (fixed UUID-shaped constants), never counters or randomness.
- **Hotel facilities are subject to the same publication and verification rule as external partners.**
- **No synthetic hotel "filler" stop.** The hotel is only the route origin and return point; with nothing eligible the
  Advisor returns `no_eligible_experiences`.

## Approved decisions — 2026-10-14 (from docs/implementation-plan-layers.md §4)

The owner approved all six recommended defaults:

1. **PGlite deferral lifted, for tests only.** In-process Postgres may be used for database tests. Still no Neon, no
   remote database calls, and no migrations applied to any shared or remote database. Real-Place seed data stays
   deferred.
2. **Dependencies approved**, each added only at the layer that needs it: `three` (3D models), `qrcode` (printable
   admin QR codes), `@vercel/blob` (object storage — `src/services/storage/index.ts` is currently a throwing stub).
3. **Hotel switching.** Scanning another hotel's entry QR closes the current stay (`check_out = now`) and opens the
   new one in a single transaction, behind an explicit confirmation screen. Replaces today's silent no-op, which
   returns `ok: true` naming the guest's *old* hotel.
4. **Rate limiting.** A small database-backed attempt table, scoped to check-in and QR only. No Redis. Anything
   broader is deferred.
5. **QR tokens are rotated, not hashed in place.** Fresh opaque random tokens; only hashes stored. Safe because
   migrations 0002–0004 are unapplied and no codes have been printed.
6. **Thresholds.** GPS accuracy ≤ 100 m and capture age ≤ 60 s. Category fallback visit durations (museum 60,
   restaurant 75, landmark 30 minutes), always presented as estimates and never treated as zero. AR dHash match
   threshold 0.22 over a 16x16 / 240-bit grid, as in Merged V.2.

Also recorded from the audit (see the plan document for evidence):

- `/dev/advisor-check-in` and `/dev/advisor-qr-check-in` have **no production guard**; the former generates an
  itinerary during render, the latter prints raw Place QR tokens. Fixed first, in Layer 1.
- Neither check-in path enforces the stop's saved `checkInMethod`, and `markStopVisited` overwrites it. Fixed in
  Layer 1. `CHECK_IN_METHODS` has no `"ar"` yet.
- Progressive reveal is a **deliberate** change to accepted behavior: `current-itinerary.ts` currently returns all
  upcoming stops and the full route geometry. Its tests will be changed on purpose in Layer 4.

## Layer 1 — implemented design (pending review)

Status: implemented and tested. **Migration 0005 has been applied only to throwaway in-memory PGlite instances
during tests; it has not been applied to any persistent, shared or remote database.** No browser or device check ran.

### QR credentials

- New `qr_credentials` table (migration 0005, additive). A credential stores `purpose` (`hotel_entry` or
  `place_check_in`), exactly one subject (`hotel_id` XOR `place_id`, enforced by a CHECK), a **SHA-256 hash** of the
  token, optional `expires_at`, optional `revoked_at`, and who issued it.
- **Purpose separation is a database fact**, not a convention: the subject/purpose CHECK plus a purpose comparison in
  `services/qr/resolve.ts`. A hotel-entry code presented for a Place check-in fails, and vice versa.
- **SHA-256, not bcrypt**, deliberately: tokens are 32 random bytes, so there is nothing to brute-force, and a fast
  digest allows a single indexed lookup instead of comparing every row.
- **At most one live credential per subject** (two partial unique indexes). Rotation is revoke-then-issue in one
  transaction, so two working codes for the same door cannot coexist.
- **Expiry defaults to null** (approved 2026-10-14): printed codes end by revocation or rotation.
- **One-time reveal** (approved 2026-10-14): the raw token exists only in the issuing action's return value and the
  admin's browser memory. Nothing reads it back; a lost code is replaced by issuing a new one. The printable QR image
  belongs to the Layer 7 admin catalog, with the `qrcode` dependency.
- **Rotation, not backfill**: no legacy token was copied in. Each hotel and QR Place needs an admin to issue a fresh
  credential. `hotels.qr_token` and `places.qr_token` are kept (nullable) but are no longer read or written by any
  code path; `findHotelByQrToken` and `findPlaceByQrToken` are gone. `src/services/qr/secret-handling.test.ts` fails
  if any of that is reintroduced.
- The advisor-testing scenario tool holds no secret: to exercise a scan it **rotates** the Place's credential and uses
  the fresh value in-process.

### The stop's saved check-in method is authoritative

- `services/advisor/check-in-method.ts` is the single rule. GPS cannot complete a `qr` stop and QR cannot complete a
  `gps` stop; both refuse with `wrong_check_in_method` and **write nothing**. Legacy `"auto"` is accepted by either
  method (no writer has ever produced it, but a stored row must not become uncompletable).
- `markStopVisited` no longer writes `check_in_method`. It previously overwrote the stop's requirement with whichever
  method had just succeeded, which erased the requirement it was meant to enforce.

### Hotel entry and the confirmed switch

- A hotel is resolved from the scanned credential, never from a client-supplied hotel id.
- **Previous behaviour, now replaced:** a guest with an active Hotel A stay who scanned Hotel B's code received
  `ok: true` naming **Hotel A** — the scan silently did nothing.
- Now `decideHotelEntry` returns `switch_required`, `/checkin/[token]` renders a confirmation screen, and only on
  confirmation does `switchActiveStay` close the old stay (`check_out = now`) and open the new one **in one
  transaction**. The closed stay is kept as history. The confirmation re-resolves the hotel from the same token, so
  the confirm step cannot be pointed at a different hotel by editing a form value.

### Verification

- 479 unit tests pass, including PGlite database tests that apply migrations 0000–0005 to an in-memory Postgres and
  prove: the purpose/subject CHECK, both partial unique indexes, token-hash uniqueness, credential cascade on subject
  deletion, the one-active-stay index, the switch transaction (including rollback leaving the original stay intact),
  the conditional visit UPDATE, that a visit does not alter the stop's saved method, and that a completed stop still
  cannot be superseded.
- `typecheck`, `lint` and `build` pass.

### Limitations carried into later layers

- **PGlite runs one connection and serializes statements**, so these tests prove conditional-UPDATE semantics, not
  true parallel row locking. The concurrent-revocation race documented above is unchanged.
- **The `db/queries/*` functions are still covered only by injected fakes.** Each begins with `import "server-only"`,
  which throws outside Next's bundler, so the PGlite tests exercise the schema and the same SQL shapes rather than
  those functions themselves.
- **Rate limiting is not in this layer** (Layer 5), so credential-entry attempts are unthrottled.
- `CHECK_IN_METHODS` still has no `"ar"`; the AR layer needs a migration for it.
- The legacy `hotels.qr_token` / `places.qr_token` columns and the unused `is_hotel_stop` column still exist and
  should be removed in a later, deliberate migration.

### Layer 1 — further limitations and deliberate choices

- ~~**The scanned token appears in the confirmation page's URL and bound action argument.**~~ **SUPERSEDED** by the
  follow-up section below: the confirmation step now carries no token at all. The scanned link itself still contains
  the credential — see "Residual exposure" there, which is **not** resolved.
- ~~**The PGlite tests re-implement `switchActiveStay`'s SQL rather than calling it.**~~ **SUPERSEDED** by the
  follow-up section below: the tests now call the production operation directly.
- **The action layer still has no tests of its own.** `features/hotel-stays/actions.ts` and
  `features/qr-credentials/actions.ts` are covered only through their parts (`services/qr`,
  `services/stays/hotel-entry`, and the PGlite operation tests). The actions themselves import `server-only` modules
  and are not reachable from a plain `node --test` run.
- **`revalidatePath` was moved out of the render path.** `/checkin/[token]` calls `checkInToHotelByToken` during a
  Server Component render, and the Next docs scope `revalidatePath` to Server Functions and Route Handlers. Both entry
  paths redirect to `/`, which is dynamic, so nothing was lost. **No browser check has run on this route.**
- **OPEN, pre-production: `/checkin/[token]` still performs writes during page rendering.** The route creates a stay,
  or records a pending switch, from inside a Server Component render rather than from a Server Function or Route
  Handler. React may re-run a render, so the writes are written to be safe to repeat (the stay insert is guarded by
  the one-active-stay index; the pending switch is an upsert), but this is not where mutations belong. Moving the scan
  landing to a Route Handler or an explicit action is **not done** and should happen before any production deployment.
- **Admin credential actions validate their bound ids** (`features/qr-credentials/schema.ts`), so a tampered or
  malformed id is a clean refusal rather than a Postgres error.
- `npm test` now starts PGlite; it still needs no network and no database server. README updated.

## Layer 1 follow-up — verification gaps closed (2026-10-14)

### 1. The PGlite tests now call the production operation

The stay write operations moved to `src/db/operations/hotel-stays.ts`, which takes the database handle as an
argument and imports neither `@/db` nor `server-only`. `db/queries/hotel-stays.ts` is now a thin binding of the
production singleton with no logic of its own, and the PGlite tests call `switchActiveStay(db, …)` and
`createHotelStay(db, …)` directly. The duplicated SQL in the tests is gone, so the test cannot pass while the
production path is broken. `src/db/operations/binding.test.ts` fails if logic creeps back into a wrapper, if an
operation starts importing `@/db` or `server-only`, or if the PGlite tests stop calling the real operations.

### 2. The scanned token no longer reaches the confirmation step

**The exposure that existed:** the switch confirmation lived at `/checkin/<token>` and its confirm button was
`confirmHotelSwitchFormAction.bind(null, token)`. Next does not encrypt bind arguments, so the raw hotel-entry
credential — a **bearer credential**: anyone holding it can start a stay at that hotel — sat in the URL (and so in
browser history, the referrer, and any proxy or server access log) and in the page's serialized action payload.

**Now:** the credential is used once, at the scan, and is finished with. A verified scan writes a
`pending_hotel_switches` row for the authenticated guest (migration 0006, additive), and `/checkin/<token>`
immediately redirects to `/checkin/confirm`, which renders no token, takes no route parameter, and whose confirm and
cancel actions take **no arguments at all**. The hotel comes from the guest's own pending row, which only a verified
scan could have created. Manual code entry redirects to the same tokenless screen, so a typed code never enters a URL.

- One pending switch per guest (primary key); a second scan replaces the first.
- It expires after **10 minutes** (`PENDING_SWITCH_TTL_MS`), enforced in the read's WHERE clause, not assumed from the
  row's presence, and it is deleted once confirmed, cancelled or superseded — so a reopened tab cannot confirm a stale
  question.
- Proven against PGlite: record/read, replacement, expiry (including the boundary instant), clearing, per-guest
  isolation, and cascade when the hotel is deleted.

**Residual exposure, stated plainly — the token is not server-only.** The scanned link `/checkin/<token>` still
contains the credential, because that link *is* what the QR encodes; the guest's browser must send it once. It can
therefore appear in that guest's history and in server access logs for that single request. What has changed is that
it no longer persists into a second page, a form payload or a shareable confirmation URL. Mitigations: it is the code
for the hotel the guest is physically standing in; it is stored only as a hash, so a log entry cannot be matched back
to the stored row by reading the database; and it can be revoked or rotated at any time from the hotel's admin page,
which immediately kills the old code. **Not yet mitigated:** nothing rate-limits attempts (Layer 5), and nothing
strips or redacts these paths from access logs — worth doing before any production deployment.

## Layer 2 — time-aware Advisor (implemented, pending review)

Status: implemented and tested. **Migration 0007 has been applied only to throwaway in-memory PGlite instances
during tests.** No persistent, shared or remote database has been touched. No browser or device check ran.

### Migration numbering

Layer 1 shipped two migrations (0005 `qr_credentials`, 0006 `pending_hotel_switches`), so Layer 2 took **0007**
and the plan document's later layers were renumbered (achievements 0008, models 0009).

### What the Advisor now accounts for

- **The guest's free time.** `generateItineraryForUser(..., { availableMinutes })`, chosen from 60/120/180/240.
  The value is validated against that set both in the server action and again in the service; anything else falls
  back to `DEFAULT_AVAILABLE_MINUTES` (120), which is recorded on the day like any other window. The chosen window
  is stored in `itinerary_days.available_minutes`.
- **Time spent at each stop.** `places.visit_duration_minutes` when an admin set one, otherwise an explicit,
  deterministic per-category estimate (`services/advisor/visit-duration.ts`), reported as an estimate and **never
  zero**. The resolved number is snapshotted onto `itinerary_stops.visit_duration_minutes`, so a saved plan still
  explains its own shape after the Place is edited.
- **Walking, including the walk home.** Selection uses a deliberately cautious estimate (straight-line distance ×
  1.3 detour factor at 1.2 m/s). The plan is then routed for real, and the REAL Mapbox duration plus every visit is
  checked against the window. If the real route overruns, the Advisor **drops the last ordinary stop and re-routes**
  until it fits, rather than handing over a day that does not. If not even one experience fits, it returns the new
  `no_plan_fits_time` with a plain-language message — it never invents a shorter substitute.
- **Facility placement.** A hotel-owned facility is pinned to the **start on odd days and the end on even days**,
  never the middle (walking home and out again is the one shape a loop should not have). It is only pinned when the
  day has somewhere else to go: a day made entirely of the hotel's own facilities is optimised normally.
- **Scheduled hotel events.** New `hotel_events` table referencing its hotel and its canonical venue Place — not a
  duplicate of either. At most one event per plan, and only when it belongs to the guest's own hotel, is still
  scheduled, has a venue that passes ordinary eligibility, has not started, and ends within the guest's window. An
  event late in the window is pinned last; an imminent one first. **Nothing reserves, holds or confirms attendance,
  and no copy implies it does.**

### Routing honesty

When a hotel activity is pinned, the ordinary stops are optimised first and the whole pinned sequence is then routed
**in that order** (`getWalkingRouteInOrder`), so the saved geometry always matches the order the guest is shown.
Retained stops are never silently re-optimised, and no geometry is ever fabricated.

### Admin

- Places gained a "Typical visit (minutes)" field; blank means "use the category estimate".
- New hotel events section (`/admin/hotels/[id]/events`): schedule and cancel. Venue choices are restricted to that
  hotel's eligible Places, and the action **re-checks eligibility server-side** before writing. Cancelling never
  deletes, because a guest may already have the event in a saved plan.

### Verification

- 572 unit tests pass, including PGlite tests that apply migrations 0000–**0007** to an in-memory Postgres and prove
  the new columns are nullable, the visit-duration CHECK rejects zero/negative/over-a-day values, an event cannot end
  before it starts, a bad status is refused, a venue with events cannot be deleted (RESTRICT, SQLSTATE 23001), and
  cancellation preserves the row.
- `typecheck`, `lint` and `build` pass.

### Deliberate behaviour changes to existing tests

Several Advisor fixtures previously modelled no time at all, so the budget would have cut their plans. They were
given explicit short visit durations, or the longest window, where the test's subject is ranking, isolation or
persistence rather than timing. Two eligibility tests now pass `{ availableMinutes: 240 }` for the same reason.

### Limitations

- **Atlas does not model per-stop arrival clock times.** Event placement is therefore a half-window heuristic
  (imminent → first, later → last), not a schedule solver. A guest could still arrive before an event starts.
- The pre-routing estimate and the real route can disagree; the real one always wins, but a shrink costs extra
  Directions calls (bounded by the number of stops).
- Repairs reuse the stop's snapshot duration but do **not** re-check the window; a repaired day can therefore exceed
  the original window. Worth addressing in the progressive-reveal/repair layer.
- Events are not yet surfaced anywhere in the guest UI beyond appearing as a stop, and the read model does not yet
  expose visit durations to the sheet.

### Pre-production follow-ups carried forward (NOT resolved)

- **The scanned hotel-entry credential still appears once in the `/checkin/<token>` URL**, and so in that guest's
  history and in server access logs for that request. It is a bearer credential. Mitigations and residual risk are
  in the Layer 1 follow-up section; nothing in Layer 2 changed this.
- **`/checkin/[token]` still performs writes during page rendering.** The writes are safe to repeat, but mutations
  do not belong in a render; moving the scan landing to a Route Handler remains outstanding.
- Rate limiting is still Layer 5. Credential entry and generation attempts are unthrottled.

## Layer 2 follow-up — three correctness gaps closed (2026-10-14)

Status: implemented and tested. **No migration was added.** The database work stayed inside throwaway in-memory
PGlite instances; no persistent, shared or remote database was touched. No browser or device check ran.

### 1. Repair now preserves the day's saved time budget

Both repair paths are held to `itinerary_days.available_minutes`, the window the plan was fitted to:

- **Replace** re-routes its candidate plan and checks the REAL routed walking time plus every pending stop's visit
  time against that window. If it overruns, fewer replacements are offered — dropping the lowest-ranked first —
  until the day fits. If even the stops the guest is KEEPING no longer fit, nothing is changed at all and
  `no_replacement_available` is returned, so the explicit removal action stays open.
- **Remove** only shrinks a plan, so it cannot overrun; both paths leave `available_minutes` untouched, which is now
  asserted rather than assumed.
- A plan generated before windows existed (`available_minutes IS NULL`) is **not** retro-fitted to a budget it was
  never built for; it behaves exactly as before.
- Completed stops are still never superseded by either path — covered by its own test in the new suite.

**Honest limitation:** Atlas does not track how much of the day a guest has already spent, so the ORIGINAL window is
used as a conservative bound rather than the time actually remaining.

### 2. Events are selected against the arrival the routed order actually implies

`evaluateEventArrival` (pure, in `services/advisor/hotel-events.ts`) is applied after the stops have been ordered and
routed, using arrival estimated along that order — the walking legs plus every earlier visit.

- **Arriving early is a failure, not a success.** No Atlas plan contains a "wait outside for half an hour" step, so
  an event the route reaches before it opens is dropped and the day is re-routed without it. Unmodelled waiting is
  never assumed.
- Arriving after it ends, or with less than `MIN_EVENT_ATTENDANCE_MINUTES` (15) left, is also refused.
- Arriving part-way through is allowed, and the budgeted time becomes **what is left of the event**, never its full
  length — so a saved plan cannot claim more of the guest's day than the event can still give them.
- If dropping the event empties the day, the generator reports failure rather than inventing a substitute.

**Honest limitation:** arrival is an estimate. Mapbox's in-order route returns one duration rather than per-leg
times, so the same cautious walking estimate used for selection is used here. Treating it as exact would be the more
dangerous error, since it decides whether a guest is sent to something already finished.

### 3. `/checkin/[token]` is read-only on GET

Previously this route created a stay, or recorded a pending switch, from inside a Server Component render — so a
reload, a back button, a prefetch or a link preview could trigger it.

- The GET now calls `previewHotelEntryByToken`, which resolves the credential and reads the guest's stay and
  **writes nothing**, then renders what the code means.
- The write moved to `enterHotelByToken`, reached only from an explicit button (`enterHotelFormAction`).
- Switching hotels still takes its own second confirmation on `/checkin/confirm`, which carries no token.
- `src/app/checkin-get-safety.test.ts` fails if any write helper (`createHotelStay`, `recordPendingHotelSwitch`,
  `clearPendingHotelSwitch`, `switchActiveStay`, `revalidatePath`) reappears in the render path or in the preview.

**Deliberate, and a change from the previous guard:** the landing now renders a form bound to the scanned token.
That is the one page whose URL already contains it, so no new exposure is created; the rule that still holds — and is
still tested — is that the token never travels on to a second page. The earlier assertion ("the landing must redirect,
not render a form") was updated to say this explicitly rather than being quietly deleted.

### Verification

595 unit tests pass (up from 572), including new suites for the repair budget, event arrival, and GET safety.
`typecheck`, `lint` and `build` pass.

### Still open, tracked for pre-production / Layer 5

- **Access-log redaction for `/checkin/<token>`.** The scanned bearer credential still appears once in that URL, and
  therefore in browser history and server access logs for that request. Unchanged by this work.
- **Rate limiting** (Layer 5): credential entry, check-in and generation attempts remain unthrottled.

## Layer 2 follow-up — repairs are held to the time that is actually LEFT (2026-10-14)

Status: implemented and tested. **No migration was added**; the only new logic is one pure function and its use in
both repair paths. No persistent, shared or remote database was touched. No browser or device check ran.

### The change

`remainingBudgetMinutes({ availableMinutes, generatedAt, now })` (pure, in `services/advisor/time-budget.ts`) is now
the budget both repair paths use. The window **starts at `generatedAt`**: a guest who asked for two hours and set off
ninety minutes ago has thirty minutes, not two hours. Holding a repair to the original figure — which is what the
previous follow-up did, and documented as a limitation — could quietly hand them a day that no longer fits the
afternoon they actually have.

- **`available_minutes` is never rewritten.** It records what the guest asked for; a repair does not revise history.
  Asserted directly.
- **Clamped at zero**, so a spent window leaves nothing rather than a negative number that would read as room.
- **Null stays null.** A plan generated before windows existed has no budget to enforce, which is not the same as
  zero, and is left alone rather than retro-fitted.
- **Clock skew cannot inflate it**: a `now` before `generatedAt` yields the full window, never more.

### Replace

Gated on the remaining time. The same replacement that fits a fresh 120-minute window is refused once 90 minutes have
gone, and at the zero boundary nothing fits at all — in every refusal the plan is left completely unchanged and the
explicit removal action stays open.

### Remove — enforced, but never a refusal

Removal computes the same remaining budget and reports it (`remainingBudgetMinutes` on the result), but it is
deliberately **not** used to block the removal. Removal is the guest's way out of a stop they cannot complete;
refusing it because their afternoon has run short would strand them on exactly the plan they are trying to escape,
which the approved rule against trapping a guest forbids. What the budget guarantees on this path is
one-directional: removal only ever takes a stop away, so the day can only get shorter. The figure is surfaced so the
UI can say how much time is left instead of implying the original window still stands.

### Tests

609 unit tests pass (up from 595), including: elapsed time shrinking the budget; the exact zero boundary; an overrun
window not going negative; skew not inflating it; null windows untouched; the original window preserved through a
repair; removal still working with the window fully spent; and completed stops surviving a repair made against a
spent window. `typecheck`, `lint` and `build` pass.

**Fixture change worth noting:** the earlier repair-budget tests generated their day at 08:00 with a clock of 12:00,
which under the new rule means the window is long gone. Their subject is the window rule rather than elapsed time, so
their default generation time is now the same instant as the test clock; the elapsed-time cases are the new tests above.

### First-scan token exposure — unchanged and still open

For the avoidance of doubt, nothing in this change touched it. The hotel-entry credential is a **bearer credential**
and still appears once in the scanned `/checkin/<token>` URL, so it can land in that guest's browser history and in
server access logs for that one request. What is true: it never travels to a second page, only a hash is stored, the
GET that receives it writes nothing, and it can be revoked or rotated instantly from the hotel's admin page. What is
**not** done: access-log redaction for that path, and rate limiting (Layer 5). Both remain pre-production work.

## Layer 3 — guest profile, stay entry and eligible discovery (implemented, pending review)

Status: implemented and tested. **No migration was added.** No persistent, shared or remote database was touched.
**No browser or device check ran** — see "What could not be verified" below.

Framework guidance was read first, per AGENTS.md: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
(Server Functions are POST-only, reachable directly, and must verify authentication and authorization inside every
function — which every action here does via `requireUser` / `requireAdmin`).

### Time is reported as two facts, never one reassuring one

`summarisePlanTime` (pure, in `services/advisor/time-budget.ts`) and the `time` field on the itinerary read model
report, separately:

- **how much of the guest's window is left**, measured from `generatedAt`; and
- **what the plan still asks for**: the active route's walking time plus every PENDING visit.

…plus an explicit `fitsRemaining` verdict and `overBudgetByMinutes`. `PlanTimeSummaryPanel` shows both numbers and,
when the plan no longer fits, says so plainly: *"This plan no longer fits your time… Nothing has been changed or
removed — you can keep going, or update the plan yourself."*

- **No auto-trimming was added.** An over-budget plan is reported, never silently edited; a test asserts both stops
  survive an overrun and the guest can still continue.
- Completed stops stop costing time, so finishing one improves the fit.
- A plan with no recorded window gets `fitsRemaining: null` — "no window to judge against", explicitly not "does not
  fit".
- The walking figure covers the whole active route, including legs already walked, because Atlas does not re-route
  as the guest goes. The UI labels it a generous estimate rather than a countdown.
- **Removal remains available with the window spent** (unchanged from the previous follow-up, and re-confirmed here).

### Guest flow

- **Home** has three distinct states: no stay (only the "start your stay" path is shown); stay but no interests (says
  the Advisor cannot plan yet and links to the profile, rather than offering a button that would fail); stay with
  interests (hotel context, map, plan). A hotel with nothing approved gets its own explanation instead of an empty map.
- **Profile** is now a guest-facing interests screen: whole-row tap targets, a visible focus ring, an explanation of
  what interests actually do, a prompt when none are chosen, and a save confirmation. Saving revalidates `/` and
  `/experiences`, which plan from those interests.
- **`/experiences`** is new: the hotel's approved experiences in one list, each labelled as the hotel's own facility
  or a hotel partner, with distance from the hotel and the visit duration (marked when it is a category estimate).
  Category filters only narrow an already-eligible set. Empty states distinguish "nothing approved yet" from "nothing
  in this category", and a guest with no stay is told to start one.
- Navigation wraps at phone width, the email is hidden on small screens, and `/experiences` was added to the proxy's
  protected prefixes and matcher.

### Eligibility boundary

`/experiences` goes through `listEligibleExperiencesForGuest`, which derives the hotel from the guest's own active
stay. `guest-paths.test.ts` now also asserts that page reads no Places directly and reads no hotel id from the
request — the filter narrows, it never selects.

### Verification

621 unit tests pass (up from 609). `typecheck`, `lint` and `build` pass; the build lists `/experiences` as a dynamic
route alongside the existing guest routes.

### What could not be verified

**No browser check was run on these screens.** Every guest page requires an authenticated session and a database, and
the standing constraint forbids a remote database; PGlite is wired into the test harness, not into the running app.
So the responsive and keyboard behaviour described above is **implemented and reviewed in source, not observed in a
browser**. Running it needs a local Postgres, which is a decision for the owner.

### Still tracked for pre-production / Layer 5

- **Access-log redaction for `/checkin/<token>`.** The hotel-entry credential is a bearer credential and still
  appears once in that URL, so it can reach browser history and server access logs for that one request. Unchanged.
- **Rate limiting** (Layer 5): credential entry, check-in and generation remain unthrottled.

## Layer 4 — progressive reveal (implemented, pending review)

Status: implemented and tested. **No migration was added.** No persistent, shared or remote database was touched,
and none was set up for browser testing. **No browser or device check ran.**

### What crosses to the guest now

The full plan still exists on the server and nothing is discarded; what changed is the payload.

- **Revealed:** every COMPLETED stop (the guest's own history) and the FIRST PENDING stop — their current stop, or
  the unavailable one standing in its place.
- **Hidden:** every stop after it. Names, ids, coordinates and images stay on the server.
- **`routeGeometry` is now always null.** The saved round trip would draw the whole day, future legs included. The
  map instead draws the single leg to the current stop, fetched when the guest asks for directions through the
  existing action, which resolves the destination from their own itinerary server-side. That leg is now passed to
  the map (`onCurrentLeg`), which previously received the whole route and, after this change, would otherwise have
  drawn nothing.
- **Counts, not identities:** `remainingStopCount` (how many stops are still to come) and
  `hiddenUnavailableStopCount` (how many of those are unavailable). `stopCount` still reports the plan's total size —
  how long the day is, not what is in it.

### Repair stays reachable for a stop the guest cannot see

- `hasUnavailableStops` is computed over the WHOLE plan, hidden stops included, so the Repair prompt still appears.
- "Update my plan" calls `replaceUnavailableStopsAction`, which **takes no client input**, so it repairs hidden
  stops without the guest ever naming one.
- Per-stop removal is offered only for a stop already on screen — which is exactly the case where removal matters,
  since an unavailable FIRST pending stop is what blocks progress. An unavailable stop further along is described by
  position only ("a stop later in your day"), and handled by replace.

### Tests

635 pass (up from 621). The new suite serialises the whole payload and searches it for later stops' names, ids and
coordinates, and for the far legs of the saved geometry — a leak through a field nobody renders counts the same as
one on screen. It also covers: reveal advancing only as stops are completed; a finished day being entirely history;
hidden unavailable stops raising the signal without being named; and the blocking stop being revealed with its reason
so removal can act on it. Source guards assert the map draws only `currentLeg` and never reaches for
`itinerary.routeGeometry`.

**Six existing tests changed deliberately**, as the Layer 0 plan anticipated: they asserted the old full-payload
behaviour (every stop present, geometry passed through). Their intent was preserved — for example, the
superseded-row test now proves exclusion through `remainingStopCount` instead of a full list.

### Carried forward, unchanged

- **Layer 3's browser acceptance remains UNVERIFIED.** The responsive and keyboard behaviour of the guest screens is
  implemented and reviewed in source, not observed in a browser; no database was connected for testing, per the
  owner's instruction. This layer's UI changes are in the same position.
- **Access-log redaction for `/checkin/<token>`**: the hotel-entry credential is a bearer credential and still
  appears once in that URL, reaching browser history and server access logs for that one request. Open.
- **Rate limiting** (Layer 5): credential entry, check-in and generation remain unthrottled.

## Layer 5 — GPS evidence and narrow rate limits (implemented, pending review)

Status: implemented and tested. **Migration 0008 applied only to throwaway in-memory PGlite instances.** No
persistent, shared or remote database was touched. **No browser or device check ran.**

### Migration number

Live journal confirmed before choosing: it ended at `0007_time_aware_advisor`, so this layer took **0008**
(`rate_limit_attempts`). Achievements therefore take **0009** and models **0010**.

### GPS evidence

`services/advisor/gps-evidence.ts` is the one place the rules live, applied against the SERVER's clock:

| Rule | Value | Boundary |
|---|---|---|
| Accuracy | ≤ 100 m | exactly 100 m passes, 101 m fails |
| Reading age | ≤ 60 s | exactly 60 s passes, 61 s fails |
| Clock skew (future readings) | ≤ 5 s ahead | exactly 5 s passes, 6 s fails |
| Proximity | 150 m, unchanged | exactly 150 m still passes |

- Accuracy and capture time now travel from the Geolocation API through `getCurrentPosition` (which returns
  `PositionEvidence`), the sheet, the action schema and the service. **Both fields are required** — a reading with
  no reported accuracy or capture time has supplied no evidence, which must fail exactly as bad evidence does.
- Missing, malformed, non-finite, negative-accuracy and out-of-range values are all refused.
- **A refused reading writes nothing**, asserted by recording every write in the fakes and checking it stayed empty.
- One shared message for every evidence failure: naming the failing rule would tell a prober which number to forge.
- Method enforcement, eligibility, ownership, current-day and idempotency are unchanged and re-asserted.

**This does not prevent GPS spoofing, and nothing in the code claims it does.** Every value is self-declared by the
guest's device; a patched client can report any position, accuracy or timestamp. What the rules remove is the
ordinary case of a genuine but useless reading — a vague indoor fix, or a cached one from where the guest used to be.

### A guard that had to change, deliberately

`history-guards.test.ts` forbade **any** client-supplied time in the check-in schema. `capturedAtMs` is one, so the
guard was updated rather than deleted, and its intent pinned down with new assertions: the capture time describes the
READING, the server only ever compares it against its own clock, and it is only ever grounds to REFUSE. Nothing
derives the current day, stay or eligibility from it. A client sending a flattering timestamp can at most get its own
check-in refused.

### Rate limiting — narrow, database-backed, no Redis

New `rate_limit_attempts` table (0008) with a closed three-value scope CHECK, keyed to the **authenticated actor**,
never a client IP (one hotel's wifi is one IP; one guest fumbling a code would throttle the lobby).

| Scope | Limit | Window | Counts |
|---|---|---|---|
| `place_check_in` (GPS **and** QR share one bucket) | 10 | 15 min rolling | failures only |
| `hotel_entry` | 5 | 15 min rolling | failures only |
| `qr_credential_issue` | 20 | 1 hour rolling | **every** operation |

- Guest scopes count only failures, so completing stop after stop is never throttled. Credential issue counts every
  operation, because successful rotation is the expensive thing — counting only failures would leave a free loop.
- **Not a lockout:** the window rolls, nothing escalates, and limits are per-actor, so nobody can drive another
  guest's allowance. Proven by a test where one user exhausts their limit and another is unaffected.
- Applied to **only** the approved operations. A guard test isolates `generateItineraryAction`,
  `replaceUnavailableStopsAction` and `removeUnavailableStopAction` and asserts the limiter is absent, and that the
  read-only scan landing (`previewHotelEntryByToken`) is not charged — it runs on every reload.
- The table stores `scope`, `actor_id`, `occurred_at` and nothing else: no token, hash, coordinate or stop id. A test
  asserts the column list exactly.
- Refusals are one generic sentence that mentions no hotel, code, credential, purpose or stop.

### Verification

690 unit tests pass (up from 635), including 4 PGlite suites. `typecheck`, `lint`, `build` pass; `git diff --check`
reports no whitespace errors.

**PGlite serialises statements**, so these tests prove counting, the rolling window, the scope CHECK and the FK
cascade — they do **not** prove behaviour under genuinely parallel requests. `reserveAttempt` counts and inserts in
one transaction, which closes the obvious double-read, but relies on the transaction rather than row locking: at the
exact boundary under real parallel load a request could still slip through. For a throttle meant to stop loops and
brute force, off-by-one at the edge is acceptable; it would not be for anything requiring exactness, and nothing here
requires it.

### Still open

- **Access-log redaction for `/checkin/<token>`** — unchanged, Layer 10.
- **Layer 3 browser acceptance** — still unverified; no database was connected for testing.

## Layer 7 — admin catalog (partial; two sections blocked)

Status: implemented and tested for the sections that have a schema. **Migration 0009 applied only to throwaway
PGlite instances.** No persistent, shared or remote database was touched. **No browser check ran.**

### Layer 6 was skipped

Layer 6 (permanent visits and achievements) was never implemented, so there are no `achievements`,
`achievement_unlocks` or `place_visits` tables. Layer 8's model tables do not exist either. An Achievements or
Models admin screen now could only be buttons with nothing behind them, so **both sections are deliberately absent**,
and a test asserts their absence rather than leaving a half-built screen to be mistaken for working.

### A real defect found and fixed: deleting a hotel destroyed guest history

`hotel_stays.hotel_id` and `itinerary_days.hotel_id` were `ON DELETE CASCADE`. Deleting a hotel therefore erased
every stay at it, and every itinerary and completed visit inside those stays, with nothing warning the admin.

- **Migration 0009** rebuilds both constraints as `RESTRICT`. No data is changed or dropped. The database now
  refuses, so this holds even if the application is bypassed.
- `deleteHotelAction` counts what is in the way first and refuses with a sentence naming it, rather than surfacing a
  constraint error. The hotel's OWN records (partnerships, facilities, events, credentials) still cascade, so they
  are counted too — losing an approval audit trail to one click is also a real loss.
- The hotels admin page now renders that refusal.
- **Open product decision:** hotels have no archive. A hotel with history now cannot be deleted at all, which is the
  safe default, but "retire a hotel" has no answer yet.

### Sections

| Section | State |
|---|---|
| Hotels | existing CRUD, now with safe deletion |
| Attractions | **new** `/admin/attractions` — a view over canonical Places (non-hotels) showing publication, verification, archive state, visit duration, and how many hotels approve each. Surfaces the invisible case: a published, verified Place that no hotel has approved reaches nobody. |
| Partners | **new** `/admin/partners` — every hotel-to-partner relationship across all hotels, with suspend / reopen / revoke. Confirmation stays on the hotel's own page, where the date window and priority belong. |
| Facilities | existing, per hotel |
| Events | existing, per hotel; venue eligibility already re-checked server-side at save |
| QR credentials | existing; issue/rotate reveals the raw value once and stores only a hash |
| Achievements | **BLOCKED** — no schema (Layer 6) |
| 3D Models | **BLOCKED** — no schema, no `three`, no object storage (Layer 8) |

Both new screens are views over the canonical model: neither creates a Place, and a test asserts it.

### `anchor_hotel_id` — documented conclusion

**It does not exist in Atlas and should not be added.** Zero occurrences in `src/`. The ER diagram's concept maps to
`hotels.place_id` — a hotel *is* a Place, and that column is the hotel's own anchor Place, carrying no eligibility
meaning whatever. Eligibility comes only from `hotel_partnerships` and `hotel_facilities`. A hotel-id column on
`places` is precisely the shortcut that would let a Place look eligible without an explicit relationship, which is
the rule the whole product rests on. (An alias in the new partnership query was renamed `hotel_anchor_place` after
the legacy-table guard correctly flagged its original name.)

### Tests

704 pass (up from 690; 6 PGlite suites). New coverage:

- **Every exported admin action is authorized** — directly, or through a module-local helper proven to call
  `requireAdmin()` itself. Server Functions are reachable by direct POST, so a page-level guard protects the screen
  and not the mutation.
- No admin action reads a role or permission from client input.
- Hotel deletion: refused by the database (SQLSTATE 23001), stay left intact afterwards, completed stops survive,
  and administrative-only blockers are distinguished from guest history.
- Place deletion still refuses with an explanation and points at archival.
- No admin screen touches `tokenHash` or renders a raw credential.
- Achievements and Models sections are absent rather than faked.

`typecheck`, `lint`, `build` pass; `git diff --check` reports no whitespace errors.

### Still open

- **Layer 6** (permanent visits, achievements) — skipped, and blocking the Achievements admin section.
- **Layer 8** model schema, `three`, object storage — blocking the Models section.
- **Hotel archival** — needs a product decision.
- **Access-log redaction for `/checkin/<token>`** and **Layer 3 browser acceptance** — unchanged.

## Layer 6 — permanent visits and achievements (implemented, pending review)

Status: implemented and tested. **Migration 0010 applied only to throwaway PGlite instances.** No persistent,
shared or remote database was touched. **No browser check ran.**

Journal verified before choosing the number: it ended at `0009_protect_guest_history`, so this took **0010**.

### The model

Three tables, all additive:

- **`place_visits`** — one row per user per Place, for ever. `first_visited_at` never moves, `last_visited_at` and
  `visit_count` follow repeats, and `first_verification_method` records how the original arrival was proved.
  Unique on `(user_id, place_id)`: that constraint IS the idempotency.
- **`achievements`** — an optional badge attached to a Place, **unique per Place**, so "unlocked" stays one yes/no
  fact. No points, level, streak or rank column exists, and a test asserts the absence by reading
  `information_schema`.
- **`achievement_unlocks`** — unique on `(user_id, achievement_id)`, pointing at the `place_visit` that earned it, so
  a badge can always be traced back to its evidence.

Deliberately **separate from itinerary-stop completion**: the same Place visited on three stays is three completed
stops but one place the guest has been to, and a repaired plan must not be able to unvisit anywhere.

`place_id` on visits and achievements is RESTRICT, as is `place_visit_id` on unlocks — a Place somebody has visited
is archived, never deleted, and the evidence behind a badge cannot be removed.

### Recording

`db/operations/place-visits.ts` → `recordVerifiedVisit`, injectable and called by the PGlite tests directly.

- Upsert on `(user_id, place_id)` and an insert-on-conflict-do-nothing for the unlock, **both in one transaction**.
  Idempotency is a database constraint, not a read-then-write.
- Called from the GPS and QR check-in services **only after `markStopVisited` has succeeded** — i.e. after every
  ownership, stay, day, order, method, evidence and eligibility rule has passed. A refused check-in therefore cannot
  create a visit or a badge by construction, not by a flag.
- The arrival that earns a badge returns it as `unlockedAchievement`; later arrivals return null, which is what stops
  a first-unlock celebration repeating.

### Guest collection

`/collection` shows the signed-in guest's badges and visited places. Read entirely with their own server-resolved
id — there is no user parameter to tamper with. It reads **permanent visits, never itinerary stops**, so it cannot
leak an unrevealed stop, and it survives the stay ending.

### Tests

730 pass (up from 704; 7 PGlite suites). Highlights:

- **A refused check-in records nothing** — asserted separately for unreliable evidence, stale evidence, out of
  range, wrong method, another guest's stop, out-of-order, and revoked eligibility. The fake recorder's call list
  must be empty in every case.
- Idempotency: a second visit updates one row, keeps the original first-visit time and original verification method,
  and earns no second badge; the unlock keeps its original timestamp.
- One guest's history is invisible to another.
- A superseded itinerary stop does not unvisit a Place; a visited Place cannot be deleted; a badge's evidence cannot
  be deleted.
- At most one achievement per Place, and a blank name is refused.

`typecheck`, `lint`, `build` pass; `git diff --check` clean.

**PGlite serialises statements** — these prove the constraints and the upsert/on-conflict semantics, not behaviour
under genuinely parallel requests.

### A test premise I had wrong, and corrected

I first asserted that a stop whose Place had been deleted would still complete while recording no visit. It does
not: the existing availability rule treats a stop with no Place as `place_removed` and refuses the check-in outright.
The test now asserts that real behaviour, which is the better outcome anyway.

### Next

- **Layer 7 remainder:** the Achievements admin workflow is now unblocked and is the next piece.
- Layer 8 then has a real unlock source: `hasVisitedPlace(userId, placeId)`.

## Layer 7 remainder — Achievements admin (implemented, pending review)

Status: implemented and tested. **No migration was added** — the journal ends at `0010_visits_and_achievements` and
the schema already supports everything implemented. No persistent, shared or remote database was touched. **No
browser check ran.**

### Scope delivered

`/admin/achievements` (list + create) and `/admin/achievements/[id]` (edit), plus create / update / delete actions.

| Requested field | State |
|---|---|
| name | implemented |
| badge image URL | implemented |
| description | implemented (already in schema) |
| **slug** | **not in the schema** — not added |
| **status** | **not in the schema** — not added |

Slug and status would each need a migration and a product decision (what a slug is for — public URLs? — and what a
status would mean for guests already holding the badge). Flagged rather than invented, per "as supported by the
current schema".

### Safety properties

- **Every action authorizes itself** with `requireAdmin()`, and the module was added to the admin-authorization
  guard's list, so a future action in it cannot forget.
- **The Place is re-read from the database**, never trusted from the form: it must exist, must not be a hotel's own
  Place, and must not already have a badge (the unique constraint backs this up).
- **A badge's Place cannot be changed.** The edit schema has no `placeId` field, and a test asserts its absence — an
  unlock points at a verified visit to that exact Place, so moving the badge would rewrite what earned guests did.
- **Badge URLs are validated for shape only and never fetched.** `http:`/`https:` only, 2000 characters max.
  `javascript:`, `data:`, `file:` and `ftp:` are refused. Nothing in Atlas requests the address — no validation
  fetch, no HEAD, no thumbnailing — which is the actual defence against SSRF here, since a server-side fetch of an
  admin-supplied URL would reach anything inside the deployment with the server's own network position.
- **An earned badge cannot be deleted.** The guarded operation counts unlocks and deletes in one transaction; the
  schema refuses independently (`achievement_unlocks.achievement_id` is RESTRICT), proven by a test that deletes
  straight at the table and gets SQLSTATE 23001. Editing an earned badge is allowed and changes only how it appears.
- **No archive mechanism exists for achievements**, so the honest options are "delete while unearned" or "keep". A
  hide-but-keep state would need a schema change and a decision about what holders then see.

### Tests

752 pass (up from 730; 8 PGlite suites). New: badge URL scheme rejection, name/description validation and trimming,
the absent `placeId` on edit, unearned deletion, earned deletion refused with a count, evidence intact after the
refusal, force-delete refused at the table, rename preserving unlocks, listing counts (including a guest who visited
twice counting once), one badge per Place, and a badge on a non-existent Place refused.

`typecheck`, `lint`, `build` pass (`/admin/achievements` and `/admin/achievements/[id]` listed); `git diff --check`
clean. **PGlite serialises statements** — constraints and transaction semantics only, not parallel load.

### Housekeeping

- Deleted `src/features/achievements/types.ts`, a 4-line placeholder from Phase 1 superseded by the real schema.
- `db/operations/achievements.ts` joins `places` for the admin listing's names, so it was added to the eligibility
  boundary guard's allowed list with that reasoning: admin-only, hands no Place to a guest, decides no eligibility.

### Next

Layer 8 is now unblocked: `hasVisitedPlace(userId, placeId)` is the real unlock source, and badges exist to be
earned. Still true for Layer 8: `three` needs installing, and **Blob credentials are absent**, so uploads must use
the injectable storage interface with a test fake and cannot be claimed as verified.

## Layer 8 — 3D Place models (implemented, substantially unverified in a browser)

Status: implemented and tested where testable. **Migration 0011 applied only to throwaway PGlite instances.** No
persistent, shared or remote database was touched. **No browser, device or GPU check ran — see "What is NOT
verified", which is the most important section of this entry.**

Journal verified first: it ended at `0010_visits_and_achievements`, so models took **0011**. `three@0.169.0`
installed as approved.

### Unlock state

**The sole source is the authenticated guest's own permanent verified visit** (`place_visits`). Not itinerary-stop
completion, not a client flag, not styling.

- `buildGuestModels` returns `unlocked` per model, decided on the server from that guest's visits.
- The payload is the **same shape** locked or unlocked, so the difference cannot be inferred from what is missing.
- Tested: one guest's visit does not unlock a model for another guest; an eligible-but-unvisited Place stays locked;
  the unlock survives the itinerary that produced it.

### Eligibility and privilege

- Models are sent only for Places the guest's own hotel has approved; a guest with no eligible Places gets nothing
  and the model query is never even reached.
- A visit to an INELIGIBLE Place does not make it visible — eligibility gates what is sent, the visit only colours it.
- **Privileged fields never cross:** `storageKey` (how a file is overwritten or deleted) and `uploadedByUserId` are
  dropped by construction, asserted by serialising the payload and searching it.
- Draft models are never sent.
- `db/queries/place-models.ts` joins `places` for anchor coordinates, so it was added to the eligibility boundary
  guard — with new assertions pinning why it is safe: it takes an explicit list of already-eligible ids and returns
  nothing for an empty list, so it can only narrow.

### Map architecture

One Mapbox map (unchanged), **one custom layer, one Three.js scene, one renderer**, and the renderer **shares
Mapbox's WebGL context** rather than creating a second one. Guards assert all of this, plus: the canvas Mapbox owns
is never cleared, the shared renderer is never disposed (that would take the map down), per-model geometry and
materials ARE disposed, and the shared locked material is never disposed (it would blank every other locked model).

Placement comes from geography: `buildAnchorMatrix` is built from the Place's own longitude and latitude, the group
is `matrixAutoUpdate = false`, and the frame's camera matrix comes from Mapbox. No screen-pixel anchoring anywhere.

**Picking is real raycasting** — `setFromCamera` + `intersectObjects`, resolving the hit mesh to its Place by walking
up `userData.placeId`. Nearest-marker guessing is explicitly absent and asserted against.

Graceful behaviour: a model that fails to load is caught per model and leaves the map usable; a failed load is not
cached as permanently broken; models are skipped below zoom 14 and when disabled for a constrained device.

### Axes

**+X east, +Y up, +Z south**, as approved. 22 tests check the maths by arithmetic: Mercator orientation, the Y flip
(Mercator y grows southward, so "up" must come out negative), metres-per-unit varying with latitude, rotation not
moving the anchor, elevation, determinism, height normalisation and grounding.

One test finding worth recording: my first tolerance was absurdly tight. Axis directions are measured by subtracting
two values of ~0.62 to recover ~3e-8, so cancellation gives ~1e-16 of error — an absolute epsilon there measures
float64, not the maths. The tests now compare relative error and say why.

### Storage — honest refusal

**No object store is configured and none was faked.** `services/storage` exposes `configured: false` and refuses
with an actionable message; the upload action surfaces that and **writes no model row**, because a row pointing at a
file that does not exist is worse than the refusal. The admin page states it before an admin picks a file.

Upload validation (pure, tested): binary glTF only, 25 MB cap, non-empty, and a **GLB magic-number check** so a
renamed executable with the right content type is refused. Nothing server-side ever parses or executes the file.

### What is NOT verified

- **Nothing in this layer has been seen rendering.** `PlaceModelsLayer` needs a WebGL context and a live Mapbox map;
  it is covered by structural guards over its source, not by execution. Anchoring on a real map, picking accuracy,
  frame cost, context loss, resize and teardown are **source-reviewed only**.
- **No real Blob upload was exercised** and none is claimed. The fake storage proves the code around storage; it
  proves nothing about a real object store.
- **No device or performance check** ran. The zoom and disable paths exist but their effect on a real phone is
  unmeasured.
- PGlite serialises statements — constraints and semantics only.

### Verification that did run

830 tests pass (up from 752; 10 PGlite suites). `typecheck`, `lint`, `build` pass (`/admin/models` and
`/admin/models/[id]` listed); `git diff --check` clean.

### Configuration required before this works in production

1. An object store (Vercel Blob or equivalent) with credentials, wired into `services/storage`.
2. Models uploaded per Place and explicitly **enabled** — they start as drafts.
3. A browser pass on a real device before anyone claims the map behaves.

---

## Layer 9 — Limited AR image matching

**Status: implemented, not committed. Nothing in the camera path has run in a browser.**

### What was approved and what was built

A narrow camera check-in: a 16×16 difference hash, a 240-bit representation, a Hamming threshold of 0.22, and the
existing GPS evidence and proximity rules on top. No tracking, no object recognition, no 3D.

The hash lives in `services/ar/hash.ts` and the image reduction in `services/ar/greyscale.ts`. Both are pure and
shared by the admin's browser, the guest's browser and the server, so the three cannot drift apart about how an
image becomes a hash.

### What the matching actually proves, and what it does not

The hash matches a **framing of a subject**. It tolerates brightness, exposure and mild scale changes; it does not
tolerate large viewpoint rotation, and it does not identify objects from arbitrary angles. A photograph of a
photograph would satisfy it.

That is precisely why AR is **never accepted on its own**. Every AR check-in runs the same gauntlet as a GPS one —
ownership, active stay, current day, stop order, eligibility, saved method, GPS evidence validation, the 150 m
radius — and the hash comparison is an additional requirement, never a replacement for any of them. Tests assert a
perfect match from across the city is refused, and that position is checked *before* the stored target is read.

### No raw image is uploaded or persisted

The browser samples the live frame in a bounded 128×128 canvas, reduces it to 60 hex characters, and clears the
canvas even if drawing or pixel processing fails. The frame exists temporarily in browser memory; it is never
uploaded, stored, or put in React state. No blob, object store, database image column or image log is used.
`services/ar/target-exposure.test.ts` reads the source of every file in the AR path and fails if any of them gains
a `fetch`, a `FormData`, a `toBlob`/`toDataURL`, or an image-shaped column or field.

The admin's reference image is handled the same way: the file input is deliberately **unnamed**, so it is not part
of the submitted form at all, and only the computed hash is posted.

### The reference hash is server-side, and stays there

`place_ar_targets` is its own table so that ordinary Place reads cannot carry a target hash by accident. Exactly one
function returns a hash (`findArTargetHash`) and it has exactly one caller (the comparison); a guard asserts that
pair and fails if a third appears. Every other read names its columns explicitly and omits the hash — including the
admin listing, because an admin page is still a browser. The result type of an AR check-in has no field for a hash
and none for a distance.

**Refusals are deliberately uniform.** A near miss and a completely unrelated photo return the same sentence and no
numbers. Reporting how close a capture came would let a client hill-climb towards a match without ever being at the
Place; a test asserts the two messages are identical.

### Two bypasses that were found and closed

1. **A featureless reference.** The distance between an all-black capture and a target is exactly that target's
   set-bit count. A reference photographed against open sky or a blank wall has few set bits, so a guest with a
   thumb over the camera would have matched it. Targets are now refused on save unless their set-bit ratio is
   between 0.30 and 0.70 — a floor **derived** from the 0.22 threshold, with margin, not chosen by taste.
2. **The downscale that was tested was not the one that ran.** The first version drew the frame straight into a
   16×16 canvas, which made the tested box-average a no-op and handed the whole reduction to the browser's filter at
   a ratio where it aliases. The capture path now draws into 128×128 and the tested code does the 128→16 averaging.
   This was fixed before any target existed, so no stored reference depends on the old behaviour.

### AR is not a way around a QR requirement

The method matrix is explicit in `check-in-method.ts`: `qr` accepts only QR; `ar` accepts only AR; `gps` accepts GPS
**or** AR, because an AR attempt carries everything a GPS attempt carries and then adds a camera match — it is
strictly stronger, so offering it takes nothing away. An unrecognised stored value refuses everything rather than
defaulting open. Tests assert a QR stop is refused however good the photo and however close the guest stands, and
that nothing is written when it is refused.

### A decision that is yours to make

**Nothing currently writes `"ar"`.** Generation still assigns only `gps` or `qr`, so in practice AR today is an
optional, stronger way to complete an ordinary GPS stop — and because GPS alone still completes those stops, the
camera match **adds no assurance to any stop right now**. It is a guest-facing feature, not yet a security one.

Whether itinerary generation should start assigning `ar` to Places that have a reference is a product decision, and
it has a real cost: a stop saved as `ar` is completable *only* by camera, so a guest who denies camera access or has
no usable camera could not complete it. I have not made that change. The enforcement is already correct if you
decide to.

### Camera failure is handled as an ordinary outcome

Denial, no camera, hardware held by another app, an unsupported browser (including plain HTTP, where the API is
genuinely absent), a frame that has not arrived yet, and cancellation each get their own honest sentence and a way
to carry on — on a `gps` stop the camera is offered **alongside** "I've arrived", never instead of it. The camera is
released on success, failure, cancel and unmount; a stream arriving after the modal closes is stopped rather than
left running.

### Progressive reveal was respected

The view model asks whether a Place has a reference for the **current stop only**. Asking about the whole day would
put an answer about stops the guest cannot see yet into the server's hands, and one refactor later into the payload.
A test asserts exactly which Place ids are asked about.

### Verification that did run

**953 tests pass**, `typecheck`, `lint`, `build` and `git diff --check` pass. The suite includes PGlite tests against
the checked-in migrations and production operations; all database work in these tests is disposable and local.

PGlite (in-memory, from the checked-in migrations — no remote database was contacted and migration 0012 has been
applied nowhere else) proves: the unique target per Place, the `^[0-9a-f]{60}$` CHECK rejecting short, long,
uppercase and non-hex values, the cascade with its Place, that no column can hold an image, that the widened
check-in method CHECKs accept exactly `gps`/`qr`/`ar`/`auto`, and that a real `recordVerifiedVisit(method: "ar")`
writes both the visit and the unlock and stays idempotent on a second capture.

### What is NOT verified

- **No camera has been opened and no image has been hashed in a browser.** Camera failures, stream cleanup, late
  permission resolution after cancellation, no-frame handling, and the 128→16 averaging are tested in Node, but
  browser `drawImage`/`getImageData` are not exercised.
- **No reference hash has been produced from a real photograph**, and no guest capture has ever been compared
  against one. Whether 0.22 is the right threshold for real phones, real weather and real angles is **unmeasured**;
  it is the approved number, not a validated one.
- Browsers differ in how `drawImage` filters a downscale. The 128→16 averaging limits that, but two devices
  producing close-enough hashes for the same building is **assumed, not demonstrated**.
- **Layer 8 remains as it was: nothing in it has been seen rendering**, and no real Blob upload was exercised.
  Layer 9 changed nothing there and does not improve its verification.
- Layer 3's browser acceptance is still unverified. The scan landing GET is read-only; the first-scan bearer token
  can still appear in the initial `/checkin/<token>` URL and access logs, so access-log redaction remains a
  pre-production follow-up.
- PGlite serialises statements — constraints and semantics only, never genuine parallelism.

### Before this is useful in production

1. A browser pass on a real phone: camera permission, capture, and a match against a reference taken earlier.
2. Reference photographs captured per Place by someone standing where a guest would stand.
3. A judgement on 0.22 once there is real data — tightening it rejects honest guests, loosening it accepts
   look-alikes, and neither can be decided from test fixtures.

---

## Local development fixtures (2026-10-16, outside the layer sequence)

Requested directly: "what are the test credentials, and if there is not, add test user, give me admin
credentials, add test object and partner companies."

**There were none.** The only route to an admin account was to sign up and then run
`npm run db:seed:admin -- <email>` against an existing user.

### What was added

- `src/db/operations/dev-seed.ts` — `seedDevFixtures(db, { adminPasswordHash, guestPasswordHash })`, taking an
  injected handle like every other operation, so the PGlite test calls the real seeding code rather than a copy
  of its SQL. Stable fixture ids plus `onConflictDoNothing` make it idempotent, and in particular it can never
  rewrite the password of an account that already exists.
- `src/db/seed-dev.ts` + `npm run db:seed:dev` — the entry point. Hashes with `bcryptjs` at 12 rounds directly,
  because `auth/password.ts` starts with `import "server-only"` and throws under `tsx`.
- README section documenting the accounts, the catalog, and the manual eligibility checks.

### Decisions taken

- **The fixtures are obviously fictional.** `[Test] …` names, `.test` emails, `Atlas Test Hotel A/B`. Tbilisi
  coordinates only so walking estimates are plausible. **No real business is named or represented as a partner** —
  seeding real Places remains unauthorised.
- **No QR credential is seeded.** Issuing one means printing a raw token, and raw tokens are revealed exactly once,
  in the admin UI. The guest is given an active `hotel_stays` row instead, so the flow works without a scan.
  Asserted by a test: the credential table is empty after seeding.
- **The passwords are published in the repository**, deliberately, so nothing ever needs to be pasted into a chat
  window. That is precisely why the script refuses to run against anything but a local database.
- **The remote guard is a host check, not `NODE_ENV`.** `tsx` leaves `NODE_ENV` unset, so a production-only check
  would have been close to useless: a `DATABASE_URL` pointing at a hosted database would have been seeded with an
  admin account whose password is in the README. `isLocalDatabaseUrl` fails closed on anything unparseable, is
  checked before connecting, and never echoes the URL. `--allow-remote` is the explicit override.
- **The seed does not read the `places` table.** `services/eligibility/guest-paths.test.ts` caught the first draft
  doing so. The guard was left untouched and the read removed instead; the fixture count is a constant, kept
  honest by a test that compares it to the rows actually written.
- The guest's preferences include `nightlife` so the suspended wine bar is a real negative control — a preference
  filter must not be what hides a leaked suspended partnership.

### What ran

`npm test` **950 pass / 0 fail** (up from 936; 12 PGlite suites), `typecheck`, `lint`, `build`, `git diff --check`
clean.

### What was NOT run, and is not verified

- **Nothing was executed against `DATABASE_URL`.** Neither `db:migrate` nor `db:seed:dev` was run. No remote
  database was contacted and no Neon tool was used. The user runs both themselves, in that order.
- Eligibility is asserted through the pure `buildEligiblePlaces` over rows loaded by the test's own SQL.
  `listEligibleExperiencesForGuest` is **not** exercised: it lazily imports `db/queries/*`, which is not injectable.
- No browser has rendered any of this. The manual checks in the README are written, not performed.
- Known sharp edge: if someone signs up as `admin@atlas.test` or `guest@atlas.test` **before** seeding, the user
  insert is skipped by the conflict clause and the next insert referencing the fixture id fails with a foreign-key
  error. Use different emails, or delete the clashing account first.

## Master-prompt build (2026-10-19) — implemented, pending review

Source: `docs/master-prompts/atlas-full-master-prompt.md` (guest + admin specifications). Figma was **not accessible**
(see below); everything follows the written visual specification. Nothing was applied to any database.

### Decisions that changed earlier behaviour on purpose

- **Route preview replaces progressive reveal** (your decision, 2026-10-19). After an explicit generate the guest's read
  model carries every stop, the saved route line and the hotel as origin/return. Only the server's first pending stop is
  "current", so check-in stays sequential and server-controlled. `progressive-reveal.test.ts` was replaced by
  `route-preview.test.ts` for that reason. A missing/malformed saved line is reported as unavailable (never a straight-line
  fallback) with an explicit, rate-limited retry that re-routes the saved stops in their saved order.
- **Rate limiting gained two scopes** (`route_retry`, `support_lookup`) because the master prompt asks for sensitive and
  expensive operations to be throttled; `policy.test.ts` was updated deliberately.
- **A declared departure bounds planning without ending a stay** (`hotel_stays.expected_check_out`; `check_out` NULL still
  means "active"). `stayEndFor()` feeds the day-number maths in every caller.

### Migrations added (all additive, none applied anywhere)

**The app does not run against a database that lacks them.** Drizzle names every column, so `findActiveStayForUser` (runs in the
guest layout on every page), `places`, preferences and model reads all select columns that do not exist on a database at
0012. Until `npm run db:migrate` has applied 0013-0018, `npm run dev` errors on every signed-in page. The earlier approval to
migrate the Neon dev database covered 0000-0012 only; applying these needs a fresh go-ahead.

| # | What |
|---|---|
| 0013 | `places.price_level` (1-3, NULL = unknown), `user_preferences.max_distance_meters` (250-5000) |
| 0014 | widens the rate-limit scope CHECK (`route_retry`, `support_lookup`) |
| 0015 | `hotel_stays.expected_check_out`, `dates_source` (`guest_declared`/`verified`) |
| 0016 | `admin_audit_events`, append-only by trigger (UPDATE/DELETE refused; only the FK's own SET NULL of the actor is allowed) |
| 0017 | `place_models` display anchor (`anchor_latitude/longitude`, both-or-neither, inside Georgia), pitch, roll, per-axis scale |
| 0018 | `places.price_level_source` / `price_level_verified_at`; a price level cannot exist without its evidence |
| 0019 | GuestPrincipal Stage A: `guest_principals`, `guest_sessions`, nullable `principal_id` on 7 owner tables (unread until Stage B). **Not applied anywhere.** |

### Known limits

- Audit entries for partnerships, Places, QR credentials and models are written by a separate statement **after** the change, not in the same
  transaction (a failed audit write throws loudly, but the change has already landed). Staff-role and support-lookup audits are in-transaction.
- After a plan repair the saved route line covers the REMAINING stops (hotel -> pending stops -> hotel); completed stops stay as markers.
- The browser has not rendered any of this: no database at 0018 was available to run against.

### Not built, and why

- **`GuestPrincipal` Stage B (anonymous QR entry without sign-up)**: Stage A (structure + backfill + tests) is done and awaits
  application; Stage B is the large code change and needs its own approval — see `docs/guest-principal-plan.md`. Until then a guest
  is still an account (signed-up or the seeded test account).
- **The separately modelled mission system** (guest specification, engagement phase): missions are the itinerary stops, with an
  honest "incomplete set" report when no hotel-owned activity is included (`mission-set.ts`). Separate mission/task records and a
  mission scheduler are not built.
- **Stay assistant / AI chat, push notifications, bookings, payments**: no provider is approved. The Advisor is the
  deterministic planner; notifications show real hotel events and declared-date reminders only when the panel is opened.
- **Vercel Blob / production uploads**: not provisioned (not approved). In production, GLB uploads report that no object
  store is configured and write no row; everything else works.
- **Hotel Manager / Partner Manager roles**: out of scope for this release by the specification.
- **Pixel-matching the Figma frames**: needs exported frames (exact paddings, type scale, icon set, sheet motion curves,
  the achievement overlay, settings screen). Colours/type/radius come from the written spec only.
