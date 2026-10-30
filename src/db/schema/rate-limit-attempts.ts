import { guestPrincipals } from "./guest-principals";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { enumCheck } from "./sql-helpers";

/**
 * The scopes that are rate-limited, and the only ones.
 *
 * Deliberately a closed list rather than a free-form string: a limit that can be
 * applied anywhere eventually is, and throttling ordinary actions like itinerary
 * generation would degrade the product to protect nothing. Adding a scope is a
 * decision, so it has to be made here.
 */
export const RATE_LIMIT_SCOPES = [
  /** GPS and Place-QR check-in share one bucket: both are attempts to complete a stop. */
  "place_check_in",
  /** Scanning or typing a hotel entry code. */
  "hotel_entry",
  /** An admin issuing or rotating a QR credential. */
  "qr_credential_issue",
  /** A guest asking Atlas to redraw their saved route line — each attempt can cost a Mapbox request. */
  "route_retry",
  /** An admin looking up a guest stay for support — sensitive access, bounded so it cannot become bulk browsing. */
  "support_lookup",
] as const;
export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number];

/**
 * One recorded attempt, keyed to the AUTHENTICATED actor.
 *
 * Never keyed to a client IP: an IP is shared by a whole hotel's wifi, so one
 * guest fumbling their code would throttle everyone in the lobby. Keying to the
 * signed-in user also means a limit cannot be driven against somebody else —
 * nobody can spend another guest's allowance, so this throttles without becoming
 * a lockout weapon.
 *
 * Rows are evidence of attempts, not of credentials: no token, hash, coordinate
 * or stop id is stored here, so the table stays useless to anyone who reads it.
 */
export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull().$type<RateLimitScope>(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stage A (docs/guest-principal-plan.md): the owning principal. Nullable and unread until Stage B; user_id stays the source of truth. */
    principalId: uuid("principal_id").references(() => guestPrincipals.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("rate_limit_attempts_scope_check", enumCheck(table.scope, RATE_LIMIT_SCOPES)),
    // Every read is "this actor, this scope, since this moment".
    index("rate_limit_attempts_actor_scope_time_idx").on(table.actorId, table.scope, table.occurredAt),
  ]
);

export type RateLimitAttempt = typeof rateLimitAttempts.$inferSelect;
