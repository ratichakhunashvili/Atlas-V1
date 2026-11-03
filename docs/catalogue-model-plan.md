# Atlas catalogue model — planning (approved direction, not yet implemented)

Status: **planning only; direction and the §10 decisions approved 2026-11-03.** No application code, schema or data has been changed for this model yet. This document
replaces the earlier "hotel-specific partners only" eligibility rule as the target product logic. Until the phases
below are implemented and approved, the running code still enforces the old rule (see §3).

## 1. The model in one paragraph

A guest scans their hotel's QR code, and Atlas opens in that hotel's context. The hotel is the guest's **base**: the
starting point, the return destination, and the only hotel shown on the map. The guest can discover **every business
with an active Atlas contract** and every published **attraction**, open their details, and filter them by category.
**Hotel partnerships** no longer decide what is visible. They promote a business that is already in Atlas's network,
giving it extra prominence and priority in that hotel's guests' recommendations and plans. Plans draw on the whole
eligible catalogue, built around the guest's interests, time, location and travel time, and they always return to the
hotel. Commission is shared between Atlas and the hotel under their commercial agreements and never appears in the
guest experience.

## 2. Definitions (one canonical `Place`, explicit relationships)

| Concept | What makes it visible to a guest of Hotel H | Stored as |
|---|---|---|
| **Base hotel** | The hotel of the guest's own valid active stay | `hotels` + `hotel_stays` (unchanged) |
| **Atlas partner** (business) | An **active, confirmed, in-window Atlas contract** for the Place, and the Place is published, verified and not archived | **new:** `atlas_partner_contracts` (§6) |
| **Attraction** (non-commercial) | The Place is an attraction, published, verified and not archived. No contract of any kind is needed. | **new:** explicit `places.kind = 'attraction'` (§6) |
| **Hotel facility** | Owned by **H** and active. Only H's guests see it. | `hotel_facilities` (unchanged) |
| **Hotel partnership** | Never by itself. It **promotes** an Atlas partner for H's guests: priority, "Recommended by H", offer text. | `hotel_partnerships` (role changes) |
| **Other hotels** | Never shown. A Place that is a hotel's anchor (`hotels.place_id`), or has `kind = 'hotel'`, is excluded except for the guest's own hotel. | — |

Rules that do not change:
- A Place that is nearby, popular, highly rated, only in Mapbox, unpublished, unverified or archived is never shown.
- Mapbox renders the map and provides routing. It never supplies places.
- Eligibility is decided on the server, from the guest's own active stay. Hotel ids or Place ids sent by the browser
  never widen what a guest sees.
- No substitutions are invented when nothing fits. A plan may have fewer stops.

Combined rule:

```text
catalogue(H, now) =
    { attractions that are publishable }
  ∪ { businesses with an eligible Atlas contract at `now` }
  ∪ { facilities owned by H, active }
  − { every hotel anchor Place except H's own }

promotion(H, place, now) = an eligible hotel_partnership(H, place) exists AND place is in catalogue via its Atlas contract
```

A hotel partnership for a business whose Atlas contract has lapsed promotes nothing. The business has left the network,
so it disappears for every hotel.

## 3. Conflicts found with the new model

### Instructions and docs
- `CLAUDE.md`, the "Critical product rule: hotel-specific partners only" section, its eight required tests, the product
  definition and journey, the data-model guidance, and "Recommend only … eligible for the guest's hotel". **Updated
  with this plan.**
- `docs/atlas-knowledge.md`, the "Non-negotiable guest eligibility rule" section and the product paragraph. **Updated:
  a pointer to this plan is added; its implementation sections stay accurate until the code changes.**
- `docs/phase-acceptance-criteria.md`, earlier phases' criteria written against the old rule (Layer 3 eligible
  discovery, check-in revalidation causes, 3D models "only for Places the guest's own hotel has approved", seed
  checks). These are historical records of what was approved then. They are **not rewritten**. §9 lists the criteria
  that replace them.
- `docs/implementation-plan-layers.md`: its eligibility rows describe the old boundary. **A note is added.**

### Code that enforces the old rule (to change in the phases below, not now)
- `src/services/eligibility/rules.ts` and `index.ts`. `EligibilitySource = "partner" | "facility"`, and eligibility
  equals "hotel partnership or facility". This is the core change.
- Guest paths through that boundary: `app/(guest)/(map)/page.tsx`, `app/(guest)/(map)/places/[id]/page.tsx`,
  `app/api/places/nearby/route.ts`, `app/(app)/experiences`, `services/advisor/{daily-plan,daily-choices,stop-selection,generate-itinerary,plan-repair,stop-availability,candidates,scoring,preference-ranking}.ts`,
  `features/achievements/guest-data.ts`, `services/map3d/index.ts`, `features/hotel-events/{actions,venue}.ts`.
- Check-in revalidation (`services/advisor/check-in*.ts`). "Partnership suspended / revoked / expired" stops being a
  reason to make a stop unavailable. Contract ended, attraction unpublished or facility inactive take its place.
- Guardrail tests built around the old rule: `services/eligibility/{eligibility,rules,guest-paths}.test.ts`, the advisor
  tests that assert "Hotel B sees nothing of Hotel A's partner", and `prototype/eligibility.ts` with its fixtures.
- Seed data (`db/operations/dev-seed.ts`, `scripts/seed-test-places.ts`). Test places are visible today only through
  test-hotel partnerships, so they will need test Atlas contracts.
- Admin: `/admin/partners`, `/admin/attractions` ("No hotel has approved this yet, so no guest can see it") and the
  hotel edit pages. These explain visibility in the old terms.

### Guest-facing copy that promises "only what your hotel approved"
These need rewording. They become false under the new model, and they also expose the commercial relationship:
- `welcome/page.tsx` ("…what Hotel A and its approved partners offer")
- `stay/confirmed/page.tsx` ("the places it has approved")
- `(map)/page.tsx`, `live-missions-map.tsx`, `map/style.ts` comments and copy
- `(map)/places/[id]/page.tsx` and `experiences/page.tsx` (the "Approved by your hotel" badge)
- `daily-plan.tsx` (three strings), `no-match.tsx`, `plan/ready/page.tsx`, `checkin/[token]/page.tsx`
- The `/demo` prototype pages

Recommended replacement wording: "Recommended by Hotel A". Show it **only** on Places that Hotel A actually
partners with. It is a promotion label and never mentions approval, contracts or commission.

### Product decisions this changes or refines
- The earlier answer "attractions are visible but grey until unlocked" still holds. Attractions are always in the
  catalogue, and their badge stays grey until it is unlocked by QR, AR or location.
- The earlier answer about an ended stay still holds and is now explicit. After check-out the guest keeps their profile
  and badges, but sees no catalogue and no plan, because they no longer have a base.
- "If no partner fits, show hotel facilities and explain that no hotel-approved partner is available" changes to "If
  nothing in the catalogue fits, say so plainly and offer to change interests or time. Hotel facilities can still be
  suggested."

## 4. How each area changes

### Map discovery
- Show only the base hotel's marker. Never show other hotels.
- Load catalogue Places for the active region and the current viewport, within the existing radius bounds
  (100 m–50 km), on the server.
- Render them as GeoJSON with native Mapbox layers, as today. The catalogue is now city-wide instead of one hotel's
  short list, so it needs a real geographic index or bounding-box query and a server-side result cap. Today the index is
  only a btree placeholder (see `places_coordinates_idx`).
- Give the three kinds distinct marker styles: attraction, Atlas partner and hotel facility. Hotel-promoted partners get
  a subtle emphasis. Locked attractions are grey.

### Place details
- Any Place in the guest's catalogue can be opened.
- A Place outside the catalogue (contract ended, unpublished, another hotel, another hotel's facility) returns the
  ordinary "not available" response, decided on the server, even when the guest sends its id.
- Show "Recommended by <hotel>" and the hotel's offer text only when a promotion exists for the guest's own hotel.

### Filtering
- Category filters narrow businesses within the eligible catalogue, on the server.
- **Attractions stay visible when a business-category filter is applied.** A category filter applies to businesses.
  Attractions have their own on/off toggle and are not hidden by choosing "Food".
- Facilities follow the "Hotel" chip, as today.
- Filters can only narrow what the guest sees. They can never widen it past the eligibility rule.

### Recommendations and ranking
- Candidates are the whole catalogue (§2), scored by interest match, travel time from the current location or the
  hotel, visit duration, price preference and opening hours, as today.
- A hotel promotion adds a bounded ranking boost: `priority`, then `featured`. The boost never makes an ineligible
  Place eligible, and it never pushes out a clearly better fit beyond a documented cap.
- In "choose 1 of 3", at most one option is hotel-promoted unless the others are clearly worse fits. That keeps the
  choice honest and stops it from becoming advertising.

### Itinerary eligibility and generation
- Stops can be attractions, any Atlas partner, or the hotel's own facilities. The hotel is the origin and the return
  point, never a filler stop.
- With nothing eligible, return `no_eligible_experiences`. Plans can have fewer stops, as today.
- Saved itineraries stay history. When a stop's eligibility changes later, the stop is shown as unavailable and offered
  for repair, as today. Revalidation now checks the new rule: contract ended, attraction unpublished or facility
  inactive. Losing a **hotel partnership** only removes the promotion. It does **not** make a stop unavailable.

### Check-in, achievements and AR
- The check-in rules are unchanged: ownership, current day, stop order, method, GPS evidence and QR purpose. Only the
  eligibility check underneath changes.
- Achievements can be unlocked at any catalogue Place a guest actually visits. 3D models and AR targets are sent for
  catalogue Places instead of hotel-approved Places.

### Hotel events
- An event's venue must be the hotel's own facility or a Place in the catalogue. It no longer has to be partnered with
  the hotel.

### Admin
- New: manage **Atlas contracts** per Place: create (pending review), confirm, suspend, end, and set the dates. Each
  change is audited, as partnership changes are today.
- New: mark a Place as **attraction**, **business** or **hotel**.
- Hotel partnerships: can only be created for a Place with an active Atlas contract. The screens are re-labelled
  "Promotion", with priority, featured and offer text.
- Commission terms are **not** modelled in this plan. Building commission tracking needs its own approved phase, and it
  never reaches guest-facing code.

## 5. What stays out of the guest experience
No contract status, commission, "approved by", payment or booking language appears in guest screens. Guests see places,
times, distances, the hotel's recommendation label and their badges.

## 6. Proposed data changes (for review; nothing applied)

- **`places.kind`**: `'attraction' | 'business' | 'hotel'`, not null, with a CHECK constraint. This is explicit, not
  derived from `category`, because a museum or a tour can be either commercial or not.
- **`atlas_partner_contracts`**: `id`, `place_id` (FK, `RESTRICT`), `status` (`pending_review | active | suspended |
  ended`), `starts_at`, `ends_at`, `confirmed_at`, `confirmed_by`, timestamps. A partial unique index allows at most one
  `active` contract per Place. The status, the confirmation and the date window behave like `hotel_partnerships`.
  History is kept and never deleted.
- **`hotel_partnerships`**: the table stays. Its role changes from eligibility to promotion. A server-side rule plus a
  test (or a trigger) makes sure a partnership is only promoted while the Place has an eligible Atlas contract.
- **Backfill (needs explicit approval):** every Place that has an active hotel partnership today gets an Atlas contract
  in `pending_review`. Nothing becomes visible until an admin confirms it, which keeps today's "nothing becomes
  visible by accident" property. Places with an attraction-like category get `kind` suggested as `attraction` for an
  admin to confirm.
- **Standing constraint:** the migration is written and reviewed locally (PGlite) first. Applying it to Neon or any
  remote database needs your explicit approval.

## 7. Phases

Each phase stops for your approval. Every phase must pass the typecheck, lint, the full test suite and the production
build.

**Phase C1: data model and admin (no change for guests).**
Add the `places.kind` and `atlas_partner_contracts` migration, admin screens to manage contracts and kinds, audit
entries, and seed updates.
*Done when* admins can create, confirm, suspend and end contracts and set kinds; the constraints reject invalid states;
the migration passes on PGlite; and guest behaviour is byte-for-byte unchanged, because the old eligibility rule is
still in force.

**Phase C2: eligibility boundary.**
Rewrite `services/eligibility` to the catalogue rule (§2), with `source: 'attraction' | 'partner' | 'facility'` and a
separate `promotion` field. Every guest path keeps going through the single boundary.
*Done when* the tests in §9 pass, and the guard test shows that no guest path reads `places` directly.

**Phase C3: map, details and filters.**
Viewport loading with a geographic query and a result cap, distinct marker kinds, attractions that survive business
filters, the "Recommended by" label, and only the base hotel shown on the map.
*Done when* the browser checks at 390 px and on a throttled CPU show a smooth map with the full test catalogue, and
the filter behaviour matches §4.

**Phase C4: planning and repair.**
Candidates from the whole catalogue, a bounded promotion boost, honest 1-of-3 choices, and revalidation on the new
causes.
*Done when* the plan and repair tests in §9 pass, and the daily plan works end to end in the browser.

**Phase C5: copy and cleanup.**
Reword every string in §3, update the `/demo` prototype and its fixtures, and update the README and atlas-knowledge
implementation sections.
*Done when* no guest-reachable string mentions approval, contracts or commission.

## 8. Risks
- **Visibility jumps.** C2 changes who can see what. The backfill keeps contracts `pending_review`, so the catalogue
  starts empty and admins open it Place by Place. Shipping C2 before C1's data is confirmed would hide almost every
  business.
- **Map performance.** The catalogue is city-wide instead of hotel-sized. Mitigate with viewport queries, a geographic
  index, a server cap and native layers. Measure on a mid-range phone.
- **Promotion becoming advertising.** Cap the boost, and allow at most one promoted option in 1-of-3.
- **Stale history.** Old itineraries recorded partnership-based eligibility. Revalidation now uses the new causes, and
  old snapshots stay readable.
- **Other hotels leaking.** Hotel anchor Places must be excluded explicitly, with a test.

## 9. Required catalogue-eligibility tests (replace the old eight)
1. A business with an active, confirmed, in-window Atlas contract is visible to guests of any hotel.
2. A business without a contract, or with a contract that is pending, suspended, ended, not yet started or expired, is
   excluded from the map, details, plans, check-in, 3D models and events.
3. A published, verified attraction is visible with no contract and no hotel partnership.
4. Unpublished, unverified or archived Places of any kind are excluded.
5. A hotel facility is visible only to that hotel's guests.
6. Other hotels' anchor Places are never visible. Only the guest's own hotel appears.
7. A hotel partnership with an Atlas partner adds the promotion for that hotel only. Another hotel's guests see the
   same Place without the promotion.
8. A hotel partnership for a Place whose contract lapsed makes nothing visible and promotes nothing.
9. A business-category filter narrows businesses and keeps attractions visible. No filter widens the catalogue.
10. A Mapbox-only Place, or a nearby Place in the database that has no contract and is not an attraction, is never
    recommended.
11. Manipulated client parameters (hotel id, Place id, radius, category) cannot widen the catalogue.
12. With nothing eligible, no substitutes are invented, and plans may have fewer stops.
13. Losing a hotel partnership does not make a planned stop unavailable. Losing the Atlas contract does, and history
    stays readable.
14. The promotion boost is bounded: a promoted Place never outranks a clearly better fit beyond the documented cap.

## 10. Decisions (approved 2026-11-03)
1. **Attraction vs business: an explicit `places.kind` field that admins set** (`attraction | business | hotel`). It is
   not derived from the category. The category can only *suggest* a kind during the backfill, and an admin confirms it.
2. **Contract storage: a separate `atlas_partner_contracts` table** that keeps history, with at most one `active`
   contract per Place. Not columns on `places`.
3. **Backfill: every Place with a hotel partnership today gets a `pending_review` contract.** Nothing becomes
   visible until an admin confirms the contract. Expect the catalogue to be empty until confirmation, and confirm the
   test places before Phase C2 ships (§8).
4. **Promotion cap: at most one hotel-promoted option in each 1-of-3 choice.** The other two options are chosen on fit
   alone. The ranking boost is bounded as described in §4.
5. **Other hotels' facilities are excluded.** A facility is only ever shown to its own hotel's guests. Offering a
   facility to everyone as an Atlas partner (`kind = 'business'`) would need its own later decision.
