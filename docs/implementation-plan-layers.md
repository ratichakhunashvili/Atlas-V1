# Atlas — Layer 0: repository audit and phased implementation plan

Status: **proposal, awaiting owner approval. No implementation code and no migrations were written for it.**
Checks run this session: `npm test` → **409/409 passing**. `npm run typecheck`, `npm run lint` and `npm run build`
were **not** rerun. No database, browser or device check ran.

## 1. What is already here

The repository is much further along than the master prompt assumes. The rows below were read in code this session
unless marked *(per docs)*:

| Area | State | Where |
|---|---|---|
| Canonical `places`, publication/verification/archive | done | `src/db/schema/places.ts` |
| Hotels, one-active-stay partial unique index | done | `src/db/schema/hotel-stays.ts` |
| Partnerships (status, window, priority, confirmation) and facilities, separate tables | done *(per docs)* | `src/db/schema/hotel-partnerships.ts`, `hotel-facilities.ts` |
| Server-side eligibility boundary; client ids never widen it | done | `src/services/eligibility/` |
| `/api/places/nearby` goes through eligibility | done | `src/app/api/places/nearby/route.ts` |
| Advisor: cooldown, admin exemption, difficulty ratchet, deterministic ranking, partner priority, no filler, `no_eligible_experiences` | done | `src/services/advisor/` |
| Real Mapbox walking routes, in-order route for repairs, no fabricated geometry | done | `src/services/routing/` |
| GPS + QR check-in, ownership, current-day, stop order, revalidation before write | done | `src/services/advisor/check-in*.ts`, `stop-availability.ts` |
| Idempotent visit write (`UPDATE ... WHERE visited_at IS NULL` inside a transaction) | done | `src/db/queries/itinerary.ts:72` |
| Unavailable stops, explicit repair/remove, supersede-never-delete, duration split | done | `plan-repair.ts`, migration `0004` |
| Single Mapbox instance, GeoJSON layers, themes, Georgia view | done *(per docs)* | `src/components/map/`, `src/services/mapbox/` |

So the **eligibility, check-in, repair and routing foundations are done**. QR hardening (the prompt's Layer 1) and
time-aware generation (its Layer 4) are not. The real work is the gaps below.

## 2. Gap matrix

| Requirement | State | Evidence / note |
|---|---|---|
| **Available time drives generation** | **missing** | `generateItineraryForUser(userId, now, deps)` takes no time window. Selection is interests + a target stop count; there is no time budget, no per-Place visit duration, no return-to-hotel budget check. |
| **Per-Place visit duration** | **missing** | No column, no category fallback. |
| **Guest time-choice step in the real app** | **missing** | 60/120/180/240 exists only in the `/demo` fixture flow. |
| **Facility placed first or last, alternating by day** | **missing** | `stop-selection.ts` leads with the best partner; no facility position rule. |
| **Hotel events (time-bounded)** | **missing** | Only a facility *type* `"event"` exists; nothing is scheduled. |
| **Progressive reveal** | **conflict — see §3** | `current-itinerary.ts` returns every upcoming stop and the whole `routeGeometry`. |
| **QR hardening** (opaque, hashed, purpose-bound, expiring, revocable) | **missing** | `hotels.qr_token` / `places.qr_token` are raw token strings compared directly; `src/services/qr/index.ts` throws "not implemented". |
| **GPS accuracy + capture-time limits** | **missing** | Only lat/lng range and the 150 m radius (inclusive: `distance > 150` fails) are checked. |
| **Rate limiting** | **missing** | Nothing in `lib/authorization.ts`; no store. |
| **Permanent place visits + achievements** | **missing** | `src/features/achievements/types.ts` is a 4-line placeholder. |
| **3D models** | **missing** | No `three`, no model tables. |
| **AR verification** | **missing** | — |
| **Object storage** | **stub** | `src/services/storage/index.ts` throws on every method. |
| **Admin sections** (Attractions, Partners, Facilities, Events, Achievements, Models, QR) | **partial** | Places, Hotels, partnerships, facilities, Advisor testing exist; the rest do not. |
| **Dev/test shortcuts blocked in production** | **missing — real security gap** | `/map-preview` has a `NODE_ENV` guard and the advisor-testing service refuses in production. **`/dev/advisor-check-in` and `/dev/advisor-qr-check-in` have none**, and `src/proxy.ts`'s matcher does not cover `/dev` either. Two concrete consequences: `dev/advisor-check-in/page.tsx` calls `generateItineraryForUser(user.id)` **during render** — a write on page load, behind `requireUser` not `requireAdmin`, which also breaks the "no silent generation" rule; and `dev/advisor-qr-check-in` **prints each stop's raw Place `qrToken`** to any signed-in user, who could then check in without being there. |
| **GPS cannot check in a QR-protected stop** | **missing — existing bug** | Neither `check-in.ts` nor `check-in-qr.ts` ever compares `stop.checkInMethod`; `markStopVisited` then *overwrites* it with whichever method was used. The saved method is not authoritative. `CHECK_IN_METHODS` also has no `"ar"`, so the AR layer needs a migration. |
| **`/demo` reachable in production** | **gate, not a breach** | Fixture-only and isolation-tested (`src/prototype/isolation.test.ts`), so it leaks nothing — but it is a prototype and should be gated. |
| **Legacy `isHotelStop` / `"auto"` check-in method** | **dead but visible** | Every writer sets `isHotelStop: false`; the UI still labels it "hotel filler". Contradicts confirmed decision #5 cosmetically. |

## 3. Conflicts and my chosen interpretation

1. **Progressive reveal vs. the current read model.** The repo deliberately returns the full plan and route to the
   browser. The owner's prompt outranks that accepted behavior, so this is a **deliberate behavior change** and
   several existing tests in `current-itinerary*.test.ts` will be changed on purpose. Proposed shape: the client gets
   completed stops, the current stop and its leg only, plus `remainingStopCount` and a server-computed
   `hasUnavailablePendingStops` flag — enough to offer Repair without naming the hidden stops. The server keeps the
   full plan and geometry.
2. **Hotel events.** I will **not** reuse the `"event"` facility type for scheduled events. A new `hotel_events` table
   referencing its hotel and a venue Place keeps the canonical Place model and adds the time window the facility type
   cannot express. The facility type stays for permanent event *spaces*.
3. **`isHotelStop` / `"auto"`.** Dead in all write paths. I propose removing the "hotel filler" labels now and retiring
   the column in a later additive migration, rather than touching the schema during a feature layer.
4. **Not porting from Merged V.2:** `hotel_unlocks` (explicitly rejected as hotel context), `site-access`,
   `react-map-gl` (we keep the single raw Mapbox instance), and Tilequery/Search Box POI discovery from Map Optimized.
   I will port the *maths and rules*: `lib/map3d/anchor.ts` (+X east, +Y up, +Z south), `lib/ar-hash.ts`
   (16x16 dHash, 240 bits, 0.22 Hamming threshold), and device-performance detection.

## 4. Open decisions — each with a recommended default

1. **Database verification strategy.** *(the big one)* PGlite is deferred and no database may be used, so the
   prompt's requirements on concurrency, idempotency, unique constraints and the one-active-stay invariant can only be
   tested with injected fakes. **Recommended: lift the PGlite deferral** for tests only (no remote DB, no Neon), or
   approve a local Postgres. This changes the definition of done for the QR, check-in and achievements layers.
2. **New dependencies** (need approval under CLAUDE.md): `three` (3D), `qrcode` (printable admin QR),
   and an object store — `@vercel/blob` — because `services/storage` is a stub. **Recommended: approve all three, each
   at the layer that needs it.**
3. **Stay end / hotel switching.** Today a stay ends only by setting `check_out`, and no flow sets it. Current
   behavior, read in `features/hotel-stays/actions.ts`: a guest with an active Hotel A stay who scans **Hotel B's**
   QR gets `ok: true, created: false` naming **Hotel A** — the scan silently does nothing and the guest is told they
   are still at their old hotel. That is confusing rather than unsafe. **Recommended:** scanning another
   hotel's entry QR closes the current stay (`check_out = now`) and opens the new one, in one transaction, behind an
   explicit confirmation screen. Needs your decision before Layer 1.
4. **Rate limiting.** No Redis, serverless runtime. **Recommended: a small database-backed attempt table** for
   check-in and QR only; defer anything broader.
5. **Existing raw QR tokens: rotate or hash in place.** Migrations 0002–0004 are unapplied and no codes are printed.
   **Recommended: rotate** — generate fresh opaque tokens, store hashes only.
6. **Thresholds to confirm:** GPS accuracy ≤ 100 m and capture age ≤ 60 s; category fallback visit durations
   (e.g. museum 60, restaurant 75, landmark 30 minutes) shown explicitly as estimates; AR threshold 0.22 from V.2.

## 5. Proposed layers

Migration numbers below were renumbered on 2026-10-14: Layer 1 shipped **two** migrations (0005 qr_credentials, 0006 pending_hotel_switches), so later layers move up one. Migrations stack on top of the unapplied 0002–0004 — the first database run will apply six
migrations at once. That is a real risk and argues for decision #1.

| Layer | Objective | Main files / schema | Acceptance criteria |
|---|---|---|---|
| **1. Safety + QR + stay lifecycle — DONE** | Production-guard `/dev/*` and `/demo` and stop the render-time generate; purpose-bound hashed QR credentials; enforce the stop's saved check-in method; stay end / hotel switch | `src/services/qr/`, new `qr_credentials` table (0005) and `pending_hotel_switches` (0006), `hotel-stays`, `check-in*.ts`, `src/app/(app)/dev/` | Hotel-entry token cannot check in a Place and vice versa; only hashes stored; raw token revealed once on generation; no dev view prints a token; dev routes 404 in production; no generation on page load; GPS refuses a QR-protected stop; two active stays impossible |
| **2. Time-aware Advisor** | Available time, visit durations, facility placement, events | `generate-itinerary.ts`, `candidates.ts`, `stop-selection.ts`, `places.visit_duration_minutes` + `hotel_events` (0007), plus the **minimal admin fields** to set a duration and create an event | Plan fits the chosen window including walking and return to hotel; fewer candidates produce fewer unique stops; facility first or last, alternating by day; events only when scheduled and compatible; no filler |
| **3. Guest flow in the real app** | Interests + time steps, eligible experiences, responsive mobile screens | `src/app/(app)/` | Full journey works signed-in at 375 px, keyboard-accessible, with empty/error states |
| **4. Progressive reveal** | Hide future stops and the full route | `current-itinerary.ts`, `advisor-sheet.tsx` | Guest payload contains no future stop and no full geometry; repair still reachable; existing tests updated deliberately |
| **5. Check-in hardening** | GPS accuracy/freshness and rate limiting (the only layer that touches rate limiting) | `check-in.ts`, `features/advisor/schema.ts`, `lib/authorization.ts` | Stale or imprecise readings refused server-side; 150 m stays inclusive; repeated attempts throttled |
| **6. Visits + achievements** | `place_visits`, optional one badge per Place, idempotent unlock, guest collection, admin CRUD | new tables (0008), `features/achievements/` | Unlock granted once, only after verified check-in, survives repeat check-ins; no XP/points |
| **7. Admin catalog completion** | Attractions / Partners / Facilities / Events / Achievements / Models / QR sections | `src/app/(app)/admin/` | Every mutation rejects non-admins inside the action; validation and empty states covered |
| **8. 3D models** | One custom layer, one scene, one renderer; anchored models; locked/unlocked by permanent visit | `src/components/map3d/`, `src/services/map3d/anchor.ts`, storage, (0009) | Anchor maths unit-tested outside the browser; picking returns the hit Place; failed load and no WebGL degrade gracefully |
| **9. AR verification** | dHash + GPS provider | `src/services/ar/` | Target hash never reaches the client; hash-only and far-away attempts refused |
| **10. Hardening and full-flow verification** | Security, accessibility, mobile, production gates | — | Reported per check, with database/browser/device checks named separately and only if actually run |

Each layer ends with: diff review, `typecheck` + `lint` + `test` + `build`, an honest report of what ran, and a stop
for your approval.

## 6. What this plan cannot promise

Without a database (decision #1), the QR, check-in and achievement layers ship with unit tests over injected fakes
only; constraint and concurrency behavior will be reported as **not verified**. Browser and device checks are likewise
not run unless you approve them.
