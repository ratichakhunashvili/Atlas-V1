# GuestPrincipal — migration, backfill, compatibility and rollback plan

Status: **Stage A approved 2026-10-19 and implemented** (migration `0019_guest_principals_stage_a`, schema, idempotent backfill
`npm run db:backfill:principals` — verify-only unless `--apply` — and PGlite tests). **Not applied to any database.** Stage B (switching
ownership to the principal, and anonymous QR entry) and Stage C are NOT started and each needs its own approval. The §6 defaults were approved.
The SQL below is the original draft; the generated migration matches it.

## 1. The problem, in this repository

Today every guest must be a signed-in `users` row (email + password). Eight tables point at `users.id` as the owner of
guest data:

| Table | Column | Rule that depends on it |
|---|---|---|
| `hotel_stays` | `user_id` (cascade) | one active stay per user (`hotel_stays_active_user_idx`, partial unique) |
| `user_preferences` | `user_id` (PK, cascade) | one preferences row per user |
| `itinerary_days` | `user_id` (cascade) | unique `(user_id, hotel_id, day_number)` |
| `place_visits` | `user_id` (cascade) | unique `(user_id, place_id)` — idempotent visit write |
| `achievement_unlocks` | `user_id` (cascade) | one unlock per user per Place |
| `pending_hotel_switches` | `user_id` (cascade) | one pending switch per user |
| `rate_limit_attempts` | `actor_id` (cascade) | throttles keyed to the actor |
| `admin_audit_events`, `hotel_partnerships.confirmed_by` | set null | staff only — **not** guest ownership, unchanged |

The specs require a guest to start from a hotel QR **without sign-up**, ownership held by a server-side `GuestPrincipal`
that is either an anonymous session or a later-linked account, and no fake email/password users.

## 2. Proposed model (additive)

```
guest_principals                      guest_sessions
  id            uuid PK                 id            uuid PK
  user_id       uuid NULL UNIQUE  ←──   principal_id  uuid NOT NULL → guest_principals (cascade)
                → users (set null)      token_hash    text NOT NULL UNIQUE   (SHA-256 of a 256-bit random token)
  created_at    timestamptz             created_at    timestamptz
  last_seen_at  timestamptz             last_seen_at  timestamptz
  linked_at     timestamptz NULL        idle_expires_at, absolute_expires_at  timestamptz
                                        rotated_from  uuid NULL → guest_sessions
                                        revoked_at    timestamptz NULL
```

* A principal is **anonymous** while `user_id IS NULL` and **linked** once an Auth.js account is attached.
* Every existing user gets exactly one principal at backfill, so nobody loses anything.
* The cookie value is opaque and never stored; only its hash is. Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`.
* Staff authentication (`admin` role) stays on `users`/Auth.js and is untouched; admin permissions never come from a guest session.
* Hotel context still comes only from a validated hotel-entry QR (or the allowlisted non-production test entry). A guest
  session proves *who owns the data*, never *which hotel* — a browser-supplied hotel id remains meaningless.

## 3. Staged migration — each stage independently approved

### Stage A — additive only (this is what I would build first)

```sql
CREATE TABLE guest_principals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  linked_at    timestamptz
);
CREATE TABLE guest_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id        uuid NOT NULL REFERENCES guest_principals(id) ON DELETE CASCADE,
  token_hash          text NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  rotated_from        uuid REFERENCES guest_sessions(id) ON DELETE SET NULL,
  revoked_at          timestamptz
);
CREATE INDEX guest_sessions_principal_idx ON guest_sessions (principal_id);

-- New NULLABLE owner column on each guest-owned table. Nothing existing changes.
ALTER TABLE hotel_stays             ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
ALTER TABLE user_preferences        ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
ALTER TABLE itinerary_days          ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
ALTER TABLE place_visits            ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
ALTER TABLE achievement_unlocks     ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
ALTER TABLE pending_hotel_switches  ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
ALTER TABLE rate_limit_attempts     ADD COLUMN principal_id uuid REFERENCES guest_principals(id);
```

**Backfill** (a separate, re-runnable, idempotent script — never inside the schema migration):

```sql
INSERT INTO guest_principals (user_id, created_at, linked_at)
SELECT u.id, u.created_at, u.created_at FROM users u
ON CONFLICT (user_id) DO NOTHING;

UPDATE hotel_stays t SET principal_id = p.id FROM guest_principals p
 WHERE p.user_id = t.user_id AND t.principal_id IS NULL;
-- …the same one statement for each of the other six tables.
```

Verification queries (must all return 0 before Stage B is even proposed):
`SELECT count(*) FROM <table> WHERE principal_id IS NULL;` per table, and
`SELECT count(*) FROM <table> t JOIN guest_principals p ON p.id = t.principal_id WHERE p.user_id IS DISTINCT FROM t.user_id;`.

### Stage B — switch ownership to the principal (separate approval, after Stage A has run clean)

* `principal_id SET NOT NULL`; new uniques/indexes on `principal_id` that mirror the `user_id` ones
  (`hotel_stays_active_principal_idx`, `(principal_id, hotel_id, day_number)`, `(principal_id, place_id)`, …).
* `user_id` becomes **nullable** (an anonymous principal's rows have no user). The old `user_id` uniques stay in place
  until Stage C, so linked accounts are protected by both.
* Application code changes (the large part): `requireUser()` in guest paths becomes `requireGuest()` returning
  `{ principalId, userId | null }`; services that take a `userId` keep working because, for a linked account, the
  principal is resolved from the Auth.js session — the rename of `userId → principalId` is mechanical but touches ~12
  server files and every `findXForUser` query.

### Stage C — retire `user_id` as an owner (much later, only with explicit approval)

Drop the `user_id` ownership columns/uniques on guest tables. Not proposed now.

## 4. Compatibility during the transition

* Stage A ships **dual-read, user-first**: all existing code keeps using `user_id`; the new columns are ignored. Zero
  behaviour change, so Stage A can sit in production indefinitely.
* From Stage B, guest code resolves the principal in this order: valid guest-session cookie → else the Auth.js session's
  user's principal → else no guest (redirect to the QR/start screen, not to `/login`).
* `/login` and `/signup` keep working for staff and for guests who want an account.
* **Anonymous entry is off until Stage B is verified** (a single server-side switch). Reason in §5.

## 5. Rollback

* **Stage A rollback is clean:** deploy the previous code (it never reads the new columns). To remove the structures:
  `ALTER TABLE <each> DROP COLUMN principal_id; DROP TABLE guest_sessions, guest_principals;` — no data was moved, and
  `user_id` was never touched, so nothing is lost.
* **Stage B rollback is conditional.** Before any anonymous guest exists it is as clean as A. **After** anonymous guests
  have created data, their rows have `user_id IS NULL`, and code from before Stage B cannot see them — the rows are not
  lost, but those guests would lose access. This is the reason anonymous entry stays disabled until you are satisfied
  with Stage B, and why I would not enable it and migrate on the same day.
* Backups: because this touches ownership, take a snapshot before Stage B (your Neon dev database is the only remote
  one in scope, and I will not touch it without your explicit go-ahead).

## 6. Session lifecycle and retention (proposed defaults — tell me if you want different)

| Item | Default |
|---|---|
| Idle expiry | 30 days since last use |
| Absolute expiry | 90 days since creation (then a fresh QR scan starts a new session) |
| Rotation | on linking an account, and when a session is older than 24 h and used (old one revoked, `rotated_from` kept) |
| Sweep | delete expired/revoked sessions after 30 days; delete an anonymous principal with no stay, plan or visit 30 days after its last session ends |
| What guests are told | "Your progress is saved on this device. Create an account to keep it somewhere safer." No promise of recovery or transfer that is not implemented |

## 7. Linking an account (explicit, authorised, narrow)

A signed-in account may adopt the current anonymous principal only through an explicit "Save my stay to my account"
action, and only when the account has no stay, plan, visit or unlock of its own (so no merge is needed — the principal
simply gets `user_id` set and `linked_at = now()`, and the session is rotated). If the account already has data the action
is refused with a plain explanation; Atlas will not silently merge two histories. This is the only linking path.

## 8. Tests this will need

PGlite against the real migrations: backfill idempotency; `principal_id` uniques mirror the `user_id` ones; a visit/
unlock/stay written under one principal is invisible to another; expired and revoked sessions resolve to nobody; token
hash only stored; rotation chain; link refuses when data exists; sweep keeps principals with history. Server-level:
no guest route reads a hotel/principal id from the browser; the test-entry bypass still requires the allowlist and the
non-production environment under a guest-session request.

## 9. What I need from you

1. Approve **Stage A** (additive tables/columns + backfill script) — I will write the Drizzle migration and tests, run
   them on PGlite only, and apply nothing remotely.
2. Say whether the §6 defaults are acceptable.
3. Tell me when you want Stage B started; it is the large code change and I would do it as its own reviewed step.
