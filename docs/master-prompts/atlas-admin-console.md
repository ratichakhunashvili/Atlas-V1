# Atlas administration master prompt

Copy this prompt when planning or implementing the Atlas administration experience. It is self-contained and uses the current Atlas product brief and repository as its source of truth.

---

## Role and objective

You are the product designer, security-minded backend engineer, and full-stack developer responsible for Atlas's administration console. Build the trusted catalog and hotel relationship workflows that determine what guests can discover. Admin tooling is operational software: prioritize accuracy, clear scope, safe edits, auditability, and efficient data entry over decorative dashboard chrome.

Work in the existing Atlas repository. Before changing code, inspect the current implementation and its uncommitted changes, read `AGENTS.md` and `CLAUDE.md`, and read installed Next.js documentation under `node_modules/next/dist/docs/` for framework APIs you touch. Preserve the existing Next.js App Router, PostgreSQL/Drizzle schema, Auth.js integration, canonical `Place` model, server-side domain services, and migration history. Do not create duplicate Place/Attraction/Business catalogs or a second authorization system.

## Users and release roles

- **Guest:** uses their own active stay and may see only eligible facilities, partners, itinerary, visits, and achievements.
- **Platform Admin:** has global authority over the Atlas catalog, hotels, hotel relationships, QR credentials, and operational settings. The current first-release model has the existing `admin` role and `requireAdmin()` checks.
- **Hotel Manager:** a future role scoped to assigned hotels. They may eventually manage hotel settings, hotel-owned facilities/events, hotel-entry QR codes, and that hotel's partnership decisions, but cannot publish global Places or access other hotels.
- **Partner Manager:** a future self-service role scoped to one canonical partner Place. They may eventually maintain their Place profile and respond to proposals but cannot confirm a hotel partnership or inspect guest data.

For the first release, keep the existing guest/admin roles. Do not add hotel or partner self-service roles until their onboarding and permission model are explicitly in scope. Every future scoped role must be enforced in server code for each resource and each Server Action/Route Handler; hiding links is not authorization.

No-QR guest test entry is permitted only for allowlisted test accounts in local/development and QA/staging, using seeded fixture hotels and server-side checks on every request. Use an explicit Atlas deployment-environment setting (for example, `ATLAS_DEPLOYMENT_ENV`) with the account allowlist and fixture mapping; fail closed if it is missing or unknown. Do not rely only on `NODE_ENV`, since QA/staging deployments may run framework production mode. Admin permissions do not grant a production bypass, and a “test” label or client parameter must never make production entry skip its hotel QR.

## Non-negotiable catalog and eligibility rules

`Place` is the one canonical record for a hotel, facility, attraction, restaurant, tour, event venue, or other experience. A hotel-to-external-Place partnership is a separate, explicit relationship row scoped to one hotel. Never use a global `isPartner` property to imply that a business is a partner of every hotel.

An external Place may be recommended to guests only if all conditions are true:

1. The Place is published, verified, and not archived.
2. That exact hotel has an active, confirmed relationship with it.
3. The relationship is valid for the guest's stay date and has not been suspended or revoked.
4. The Place passes the current server-side schedule, distance, category, and availability constraints.

Apply eligibility at the intended visit time before ranking. The current 5,000-metre limit is specific to the Advisor's candidate service, measured from the hotel; do not treat it as a global partnership rule or silently widen it. Nearby, popular, highly rated, stored, or Mapbox-listed does not mean eligible. Mapbox may render locations and provide directions; it must never publish or recommend a business. Hotel-owned facilities are managed through their explicit hotel-facility relationship and do not require an external partnership. Events must use a canonical venue and must be rechecked against hotel eligibility at the event time on save. Treat hours, price, and availability as unknown unless Atlas stores their source and last-verified time.

Do not delete canonical Places that have historical itinerary, check-in, achievement, or partnership evidence. Prefer archival or a safe status transition. Preserve historical visits and unlocks when a current offering is removed.

## Administration modules

- **Dashboard:** show operational counts and actionable review queues from real data: hotels, published/verified Places, pending partnership decisions, active partnerships, upcoming hotel events, issued/revoked credentials, and recent verified visits or itinerary use where the schema supports it. Label metrics and date ranges. Do not display fabricated numbers or claim anonymous analytics unless data collection and aggregation are implemented.
- **Hotels:** create/update a hotel by linking it to its canonical Place; manage active status and settings; navigate to its facilities, approved partners, events, and entry QR credentials.
- **Canonical Places:** create/edit Place name, category, canonical coordinates, address, description, real image, publication, verification, archival, visit-duration estimate, check-in method, and optional price/availability fields only where they are supported. Record the source and last-verified time for schedule, price, and availability data before those fields affect guest recommendations. Search for likely duplicates before creation and offer an intentional create-anyway path; do not automatically merge or delete canonical records. Search/select existing Places when establishing relationships. Do not create duplicate Place tables for hotels, attractions, businesses, or venues.
- **Partnerships:** create a proposal against the canonical Place for one exact hotel; show proposed, confirmed, suspended, revoked, and expired states; explicitly confirm with validity dates and priority; suspend, revoke, or reopen with an audit record. Never make a Place eligible merely because a manager listed it nearby.
- **Hotel facilities:** manage hotel-owned facilities separately from external partnerships, with facility type, status, real availability, and itinerary eligibility.
- **Hotel events:** configure title/details, start/end time, status, and canonical venue. Validate that the venue belongs to the hotel or is an active, approved external partner at the event time. Do not represent a scheduled Atlas event as a reservation or attendance confirmation.
- **QR credentials:** issue purpose-specific hotel-entry and Place check-in credentials; store only a cryptographic hash; show the raw value/QR once at issuance; rotate and revoke safely; never include tokens in logs, analytics, URLs unrelated to the token, or later admin detail pages. A hotel-entry QR establishes hotel context only and does not verify a reservation or occupancy. Test-only no-scan entry remains an environment- and allowlist-guarded guest flow; do not add an admin setting that enables it in production.
- **Achievements:** associate at most one optional badge with a Place. Removing or changing a badge must not erase guest unlock evidence. Do not introduce an XP/points economy.
- **3D models and placement editor:** inspect the current `place_models` schema and preserve its existing model-to-Place cardinality unless a confirmed product need requires a reviewed migration. Upload/select a validated GLB and associate each model with its canonical Place. Use configured file-size and asset-complexity limits, reject unsupported formats, and never load arbitrary admin-supplied remote URLs. In a live map preview, let an authorized admin position the model's visual anchor independently of the Place's canonical latitude/longitude by dragging it on the map or entering coordinates. Provide an explicit model-placement mode so dragging the anchor does not pan the map; keep map pan/zoom available outside that mode and provide keyboard-accessible numeric controls for latitude/longitude, elevation offset, pitch, yaw/heading, roll, and uniform or per-axis scale. Include reset, preview, save-as-draft, and publish/enable actions. The anchor must remain geographically fixed when the map pans, zooms, pitches, rotates, resizes, or changes style; never store a screen pixel position. Clearly show the linked Place location, model anchor, and their distance; warn and require explicit confirmation for unusually large separation. These are display-placement fields only: moving a model must never move or alter the canonical Place, hotel-partner eligibility, recommendation distance, routing, GPS/QR/AR check-in coordinates, or achievement identity. The model tap opens the linked Place and identifies its canonical location. Derive a guest's locked/unlocked state from that guest's permanent verified visit to the linked Place, but only render the model to a guest when its linked Place is eligible for that guest's active hotel (or is that hotel's facility). Keep the existing shared Mapbox map and custom Three.js layer; do not create a WebGL context/renderer per model or replace the map to simplify the editor.
- **AR references:** configure a private Place visual reference/descriptor on the server using a documented matching method and threshold. A cryptographic hash of an image cannot establish that a visually similar camera capture is the same scene; do not implement matching as exact hash equality. At check-in require a server-validated visual-match result and accepted GPS evidence. Never send private reference data to the browser or treat a client-provided descriptor alone as proof of a visit. Keep QR/GPS verification available when the supported device cannot use camera matching.
- **Guest support:** let an authorized admin locate a stay and inspect only the minimum stay, itinerary, and visit information needed to resolve a support request. Require an operational reason and audit sensitive access where supported. Do not expose passwords, QR secrets, unrelated guest records, or bulk location history.
- **Staff access:** for the current release, allow only safe platform-admin account management supported by the current role model. Record important role changes. Do not introduce hotel-scoped/partner-scoped access until a complete resource-level policy and migrations are approved.
- **Analytics:** aggregate engagement by hotel and period, such as QR activation, eligible Place views/selections, itinerary starts/completions, hotel-facility use, verified partner visits, repeat use during a stay, and reliability. Avoid reporting personal guest location trails. Use only metrics backed by recorded events and state the limits of anonymous/de-identified data.

## Admin experience and interaction design

The [Atlas Figma design](https://www.figma.com/design/xGqcfYil4ZxW9gRdBCNfbU/Untitled?node-id=1-672&t=e8n3aei0QyBaJdKU-0) and [interactive prototype](https://www.figma.com/proto/xGqcfYil4ZxW9gRdBCNfbU/Untitled?node-id=1-948&t=ydJkzeYFsHavLtOo-0&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1) are guest references, not admin designs. Inspect them for shared Atlas visual language when accessible; do not claim they specify admin screens. Give the console a distinct, calm operational design using Atlas's warm cream, restrained navy, muted green, and stone colors. Use a compact desktop navigation and a responsive mobile menu; group related work under Hotels, Places, Partnerships, Experiences, Guest activity, and Settings. Keep hotel context visible when editing hotel-scoped relationships. Use clear status labels, search and filters, keyboard-friendly tables/lists, focused detail forms, inline validation, explicit save/cancel states, empty states, loading states, and useful error messages. The model placement workflow must include a real map canvas with the linked Place and independent visual anchor, live transform preview, and accessible numeric controls; do not reduce precise placement to a form with no map feedback.

For risky catalog operations, explain the scope and consequences in the UI and preserve recovery through archival where possible. Do not use browser alerts. Make controls touch-friendly and usable on tablet/mobile; dense records may become stacked rows or cards at narrow widths. Respect keyboard navigation, visible focus, contrast, reduced motion, and WCAG 2.2 AA guidance.

## Backend, security, and persistence

- Keep the current Auth.js integration and platform-admin identity. Require a fresh server-side role check in every mutation and protected data operation.
- Use Next.js Server Actions for form mutations and Route Handlers only where an HTTP endpoint is needed. Treat both as public endpoints: validate all input, verify authorization close to the data, and return only safe DTOs.
- Keep hotel/Place eligibility and resource scope in shared server-side services. Never trust role, hotel, Place, partnership status, verification, or guest ID from the browser.
- Keep the existing Drizzle schema and versioned additive migrations. Inspect the current migrations before adding a field/table, preserve constraints, and do not use schema push or destructive changes against a shared database.
- Store 3D display-anchor coordinates and transforms separately from canonical Place coordinates. Validate that anchors stay inside Atlas's supported map region, and make every model mutation preserve the associated Place and existing visit/unlock history.
- Keep database credentials, Auth.js secrets, server Mapbox tokens, AR references, and QR token hashes server-side. Do not expose raw secrets in admin pages after issuance or in logs.
- A hotel-entry QR selects a hotel context; it does not prove that the guest is staying there. Keep guest-declared stay dates distinct from reservation dates verified by a supported ticket or hotel integration. Do not claim reservation validation unless that integration exists.
- For model rendering, request map repaint only when model data, camera state, or an active animation requires it. Do not call `map.triggerRepaint()` unconditionally on every render or leave an idle animation loop running. Confirm the editor and guest layer use the same geographic transform conventions and remain correct after map style changes.
- Use Vercel Blob for image/GLB storage only after the storage configuration exists. Use private storage when Atlas must authorize access and explicit public storage for guest assets. Do not show a successful upload state when storage is not configured.
- Add an administrative audit record for partnership confirmation/suspension/revocation, credential rotation, Place publication/archive, model settings, and staff-role changes. Store actor, target, action, timestamp, and minimal before/after state; never store secret token values.
- Preserve historical itinerary stops, verified visits, and achievement unlocks. Make retryable operations idempotent and use a transaction when multiple related rows must change together.
- Do not connect to, mutate, or migrate a remote database without explicit approval.

## Definition of done

An admin can manage the canonical Place catalog, hotels, each hotel's facilities, partners, events, QR credentials, achievements, model placements, and AR references through working persisted workflows. Model anchors can be positioned and transformed independently while Place identity, eligibility, and check-in coordinates remain unchanged. Partnership operations affect only the intended hotel's eligibility. Guests cannot use client manipulation or direct Server Action calls to bypass server permissions. Historical guest evidence remains intact after changes. Supported uploads and analytics use real configured services/data; unavailable integrations are clearly disclosed. Responsive admin surfaces work on desktop, tablet, and phone. Add or update focused automated tests for permissions, hotel scoping, eligibility, token purpose/secrecy, model-coordinate separation and transform persistence, historical preservation, and audit behavior. Document any remaining limitation that depends on unavailable credentials, an unconfigured provider, or an explicit external approval.

Verify explicitly that moving a 3D anchor does not change the canonical Place pin, recommendation eligibility, route destination, or visit-verification coordinates; that an event at an external venue is rejected if its hotel relationship is not active at event time; and that the no-QR guest bypass cannot be enabled in production. Ensure that display placement behaves correctly through map pan/zoom/pitch/bearing/style changes without a continuous repaint loop.

## Official implementation references

- [Atlas guest experience master prompt](./atlas-guest-experience.md)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication)
- [Next.js data security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js Server Actions and mutations](https://nextjs.org/docs/app/guides/server-actions)
- [Next.js Proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Auth.js for Next.js](https://authjs.dev/reference/nextjs)
- [Auth.js Credentials provider](https://authjs.dev/getting-started/providers/credentials)
- [Drizzle PostgreSQL schema](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Mapbox GL JS performance](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/)
- [Mapbox style layers](https://docs.mapbox.com/mapbox-gl-js/guides/add-your-data/style-layers/)
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- [Deploying Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

---

## Execution instruction

Start by mapping these requirements to current admin routes, schema, queries, server actions, authorization helpers, storage services, and migrations. Identify working capabilities and gaps first. In the current repository, verify the known 3D editor limitation: existing model settings may anchor only at the linked Place and provide limited transforms; implement independent geographic anchor coordinates and full transform controls only if the inspection confirms they are absent. Keep the canonical Place and its geolocation authoritative for eligibility, itinerary and check-in. Preserve the test-only no-QR boundary in every server path. Implement the complete requested admin scope in this task, in the dependency order needed by the codebase. Do not stop after an MVP subset, split delivery into approval phases, or wait for approval between feature areas. Preserve existing work, follow repository safety requirements for remote databases and paid services, and never claim an admin control is implemented unless its server operation, authorization, persistence, and visible result all work. Report exactly what was implemented and actually verified.
