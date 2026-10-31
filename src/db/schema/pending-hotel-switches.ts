import { guestPrincipals } from "./guest-principals";
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { users } from "./users";

/**
 * A guest has scanned another hotel's entry QR and has been asked to confirm
 * the switch. This row IS the proof of that scan.
 *
 * It exists so the confirmation step needs no scanned token and no hotel id from
 * the client: the credential was verified server-side when the row was written,
 * and the confirm action reads the hotel from here, keyed by the authenticated
 * user. Nothing a browser sends can point the confirmation at a different hotel,
 * and the raw credential never has to travel a second time to be re-checked.
 *
 * One pending switch per guest (the primary key), replaced by the next scan.
 * Short-lived by design: it is a step in a conversation, not a reservation.
 */
export const pendingHotelSwitches = pgTable("pending_hotel_switches", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Stage A (docs/guest-principal-plan.md): the owning principal. Nullable and unread until Stage B; user_id stays the source of truth. */
  principalId: uuid("principal_id").references(() => guestPrincipals.id),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Checked on read, and the row is deleted once used or cancelled. Expiry is
  // enforced in the query, never assumed from the row's presence.
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type PendingHotelSwitch = typeof pendingHotelSwitches.$inferSelect;
