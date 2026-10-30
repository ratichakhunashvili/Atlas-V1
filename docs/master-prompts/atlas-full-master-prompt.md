# Atlas full product master prompt

Copy this entire prompt into Claude Code from the Atlas repository root. It directs one continuous build of the complete guest experience and administration console. It is not a phased roadmap or a plan-only request.

---

You are the lead product designer, architect, security engineer, and full-stack developer for Atlas. Implement the complete Atlas product described below in the existing repository. The requested scope includes the guest-facing experience and the platform-admin console. Treat this as one continuous implementation task: use dependency order internally, but do not divide the work into delivery phases, stop after an MVP subset, or wait for approval between feature areas.

Continue in the current Claude Code session with the same selected model. Do not spawn subagents, switch models, or start parallel implementation sessions. If the conversation is currently in Plan Mode, treat any existing plan as background context, leave Plan Mode, and implement this full scope; do not return only another plan.

## Required specifications and references

Before editing, read and follow both complete specifications in this repository:

- [Guest experience specification](./atlas-guest-experience.md)
- [Administration console specification](./atlas-admin-console.md)

They are complementary parts of this single master prompt. Apply their requirements together. If they conflict, use the following priority: explicit product and security invariants in these specifications; current working repository architecture and migrations; the visual references. Do not silently discard a requirement—explain any real conflict in the final report.

Inspect both Figma references directly when accessible:

- [Atlas Figma design](https://www.figma.com/design/xGqcfYil4ZxW9gRdBCNfbU/Untitled?node-id=1-672&t=e8n3aei0QyBaJdKU-0)
- [Atlas interactive prototype](https://www.figma.com/proto/xGqcfYil4ZxW9gRdBCNfbU/Untitled?node-id=1-948&t=ydJkzeYFsHavLtOo-0&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1)

If Figma is inaccessible in this environment, say that plainly, continue using the written visual specification in the two files, and list the exact visual details that would need exported frames to match pixel-for-pixel. Never claim to have inspected inaccessible frames. Do not block the implementation waiting for Figma access.

## Product outcome

Atlas is a hotel-connected local experience platform. A guest enters through a hotel's QR code, or through a seeded test stay under the restricted non-production test bypass. Atlas identifies the hotel, shows its own facilities and only its active, confirmed, date-valid approved external partners, collects the guest's interests and free-time window, generates a realistic itinerary, and shows the complete generated route and all stops on the shared map. The guest can navigate, complete place-based tasks through valid check-in, unlock achievements, and revisit the map and stay tools. Platform admins manage the canonical catalog, hotels, facilities, partnerships, events, QR credentials, achievements, 3D models and their independent map placements, AR references, support access, staff access supported by the current role model, and real-data analytics.

Implement working end-to-end behavior, not disconnected screens or mock buttons. Connect UI states to authorized server operations and persisted data. Build missing domain behavior where required. Reuse existing functional work rather than replacing it without evidence.

## Mandatory product rules

- Hotel context is the root of recommendations. An external Place is eligible only when that exact hotel has an active, confirmed relationship valid at the intended visit time and the Place is published, verified, not archived, and otherwise eligible. Apply this hard filter before ranking across the map, search, Advisor, itinerary, missions, events, assistant, and 3D model visibility. A nearby or Mapbox-listed place is not an Atlas recommendation.
- Hotel facilities have explicit hotel ownership and take priority in discovery. Keep them distinct from external partnerships.
- Guest preferences, pace, budget tier, free time, commitments, travel time, visit duration, supported availability data, and return buffer inform recommendations. Never treat a duration as a price budget; unknown prices or hours remain unknown.
- After explicit itinerary generation, display its full route geometry, all stops, schedule, hotel origin, and return on the one existing shared Mapbox map. Keep progression and check-in authorization server-controlled. Do not expose another guest's route or a plan that has not been generated.
- Guests must be able to complete eligible missions through supported QR/GPS verification and AR plus GPS where configured. A tap alone does not complete a visit. Persist operations idempotently. Preserve the distinction between per-stay task/visit completion and permanent one-time achievement unlocks.
- A test account can enter a seeded test hotel without scanning only in local/development or QA/staging, with explicit server-side environment, account allowlist, and fixture checks on every relevant request. Fail closed on missing/unknown environment. Production always requires normal QR entry, including for test-labeled accounts.
- An admin may place and transform a 3D model at coordinates independent of its linked canonical Place: drag its geographic anchor on a live map, or use accessible numeric latitude/longitude, elevation, pitch, heading, roll, and scale controls. The anchor stays geographically stable through map pan, zoom, pitch, bearing, resize, and style changes. The linked Place remains the source of eligibility, navigation, route destination, check-in, achievement identity, and canonical pin. Never use screen-pixel placement or let moving the model move the Place.
- Keep one canonical Place model, one database, one guest ownership model, one hotel-partner relationship model, one authorization system, one shared map instance per experience, and shared server-side eligibility logic. Do not create parallel catalogs or bypass server authorization through hidden controls.
- The current release uses the existing Guest and Platform Admin role model. Hotel Manager and Partner Manager self-service are not part of this build unless already fully supported and explicitly scoped by existing project requirements. Enforce every current permission in server code.
- Do not fabricate Places, partners, ratings, verified data, events, analytics, availability, bookings, or successful uploads. Do not implement bookings, reservations, payments, or commissions without an already approved provider and terms. Show honest unavailable/unconfigured states and complete the rest of the product.

## Repository and change-safety instructions

1. Inspect repository instructions, including `AGENTS.md` and `CLAUDE.md`, and read the relevant installed Next.js guide under `node_modules/next/dist/docs/` before changing Next.js code. This project may use breaking Next.js changes; follow the installed docs, not remembered conventions.
2. Inspect the current branch, working tree, and recent relevant code before editing. The repository may contain substantial pre-existing user work. Preserve all unrelated and uncommitted changes. Do not reset, clean, stash, stage, commit, rebase, switch branches, or overwrite user changes.
3. Inspect the existing routes, components, schemas, migrations, domain services, auth/authorization helpers, map layers, guest session/stay model, tests, and storage integrations. Verify known gaps against current code; do not assume an earlier audit is still current.
4. Keep the existing Next.js App Router, PostgreSQL/Drizzle, Auth.js, canonical Place catalog, and Mapbox/Three.js architecture unless repository evidence proves a specific change is necessary. Add only compatible, additive migrations. Never run schema push or destructive database operations against shared data.
5. Do not connect to, mutate, or migrate any remote/shared database without explicit user approval. Do not provision paid services or send data to external providers without explicit user approval. Continue implementing all other approved work and report the exact boundary. A missing credential is not permission to fake success.
6. Do not ask questions already answered by these specifications. If a genuinely blocking decision arises, complete independent work first, then ask only about that decision. Do not pause for approval between feature areas.
7. Keep implementation, authorization, persistence, and UI behavior together so each feature is usable. Keep business rules testable outside presentation. Preserve existing records and historical visits, itineraries, and achievements.

## Implementation and verification expectations

First create an internal inventory mapping each requirement in both specifications to current code, working behavior, gaps, and dependencies. Then implement the full guest and admin scope in dependency order as one continuous build. The inventory is a working aid; it is not a request to stop and return only a plan.

Implement responsive, accessible interfaces for phone, tablet, and desktop. Keep the map as the guest's main environment with lightweight sheets. Build a distinct operational admin console. Respect safe areas, keyboard use, visible focus, reduced motion, contrast, permission-denied states, weak networks, low-memory devices, and WebGL/camera/GPS limitations. Optimize the shared map: GeoJSON/style layers for POI groups, clustering where useful, selective 3D loading, no per-model WebGL contexts, no idle repaint loops, and no unnecessary map recreation or polling. Keep a usable non-WebGL/list fallback.

Secure all Server Actions and Route Handlers as public entry points: validate input, authenticate and authorize each operation, derive guest/stay/hotel ownership server-side, scope all hotel data, rate-limit sensitive operations, and return safe DTOs. Keep QR token hashes, secrets, and private AR references server-side. Use robust, documented QR/GPS/AR evidence checks and idempotency. Audit sensitive admin mutations. Add and run focused tests for the implemented business rules and security boundaries; run relevant type/lint/build checks where available. Do not modify unrelated tests or mask pre-existing failures.

Before finishing, review the full diff for accidental unrelated edits, security regressions, dead controls, fake success states, duplicate data models, unauthorized eligibility paths, mobile overflow, and new map performance regressions. Verify the end-to-end guest flow and admin workflows against persisted local/test data where the existing environment supports it. Do not access or mutate a remote database during verification.

## Completion report

When the complete work is finished, summarize:

- Guest and admin behavior implemented, including the end-to-end hotel QR/test entry → preferences → itinerary and full map route → mission/check-in/achievement journey.
- 3D editor behavior and confirmation that display anchors remain independent from canonical Place coordinates.
- Files and migrations changed, tests/checks actually run, and their results.
- Any feature blocked solely by inaccessible Figma exports, missing credentials, unconfigured paid providers, or the required approval for remote database changes. State what works despite each limitation.
- Any pre-existing failures or unrelated working-tree changes that were preserved.

Do not report a plan in place of implementation. Do not label work complete if in-scope functionality remains unimplemented.
