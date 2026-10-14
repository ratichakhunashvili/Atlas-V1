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
- **PGlite is deferred.** Database integration tests are reported as *not run*, never implied.
- **No seed of real Places** until verified pilot data is selected. Prototype fixtures only.
- **Test fixtures use stable IDs** (fixed UUID-shaped constants), never counters or randomness.
- **Hotel facilities are subject to the same publication and verification rule as external partners.**
- **No synthetic hotel "filler" stop.** The hotel is only the route origin and return point; with nothing eligible the
  Advisor returns `no_eligible_experiences`.
