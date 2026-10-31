import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  adminAuditEvents,
  hotelStays,
  hotels,
  itineraryDays,
  itineraryStops,
  placeVisits,
  places,
  users,
} from "@/db/schema";
import type { AtlasDatabase } from "./types";

/** Why an administrator is looking at a guest. Closed list: "curiosity" is not an operational reason. */
export const SUPPORT_REASONS = [
  { code: "check_in_problem", label: "The guest can't check in to a stop" },
  { code: "plan_problem", label: "The guest's plan looks wrong or is missing" },
  { code: "stay_problem", label: "The guest's stay or dates look wrong" },
  { code: "account_question", label: "The guest has an account question" },
] as const;
export type SupportReasonCode = (typeof SUPPORT_REASONS)[number]["code"];

/**
 * The MINIMUM a support admin needs to resolve a request — and deliberately nothing else.
 *
 * Included: the stay (hotel, dates, whether the dates are verified), a summary of each plan day (counts and times),
 * and how many places the guest has been verified at. NOT included, by construction: the password hash, any QR token
 * or hash, any stop name or coordinate, the route, the guest's GPS readings, or other guests' rows. Where a guest has
 * been is a location history, and support does not need it to find out why a check-in failed.
 */
export type GuestSupportView = {
  account: { id: string; role: "user" | "admin"; createdAt: Date };
  activeStay: {
    hotelName: string;
    checkIn: Date;
    expectedCheckOut: Date | null;
    datesSource: "guest_declared" | "verified";
  } | null;
  planDays: Array<{
    dayNumber: number;
    generatedAt: Date;
    completedAt: Date | null;
    activeStops: number;
    completedStops: number;
  }>;
  verifiedPlaceCount: number;
};

export type GuestLookupResult =
  | { ok: true; view: GuestSupportView }
  | { ok: false; reason: "not_found" | "invalid_reason"; message: string };

const MAX_NOTE_LENGTH = 200;

/**
 * Looks up ONE guest by exact email, writes the audit entry in the same transaction, and returns the minimal view.
 *
 * The reason is required and recorded, so access to a guest's records always leaves a trace of who asked and why. A
 * lookup that finds nobody is audited too (without the email — the trail never stores what was typed for a stranger).
 * Matching is exact: there is no prefix or bulk search, so this cannot be used to browse guests.
 */
export async function lookupGuestForSupport(
  db: AtlasDatabase,
  input: { actorUserId: string; email: string; reasonCode: string; note?: string; now?: Date }
): Promise<GuestLookupResult> {
  const reason = SUPPORT_REASONS.find((entry) => entry.code === input.reasonCode);
  if (!reason) return { ok: false, reason: "invalid_reason", message: "Choose why you are looking at this guest." };

  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  const recordedReason = note ? `${reason.code}: ${note}` : reason.code;

  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: users.id, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(eq(sql`lower(${users.email})`, input.email.trim().toLowerCase()))
      .limit(1);

    await tx.insert(adminAuditEvents).values({
      actorUserId: input.actorUserId,
      action: "support.guest_lookup",
      targetType: "user",
      targetId: account?.id ?? "no_match",
      reason: recordedReason,
      ...(input.now ? { occurredAt: input.now } : {}),
    });

    if (!account) return { ok: false, reason: "not_found", message: "No account has that email." } as const;

    const [stay] = await tx
      .select({
        hotelName: places.name,
        checkIn: hotelStays.checkIn,
        expectedCheckOut: hotelStays.expectedCheckOut,
        datesSource: hotelStays.datesSource,
      })
      .from(hotelStays)
      .innerJoin(hotels, eq(hotels.id, hotelStays.hotelId))
      .innerJoin(places, eq(places.id, hotels.placeId))
      .where(and(eq(hotelStays.userId, account.id), isNull(hotelStays.checkOut)))
      .limit(1);

    const days = await tx
      .select({
        id: itineraryDays.id,
        dayNumber: itineraryDays.dayNumber,
        generatedAt: itineraryDays.generatedAt,
        completedAt: itineraryDays.completedAt,
      })
      .from(itineraryDays)
      .where(eq(itineraryDays.userId, account.id))
      .orderBy(desc(itineraryDays.generatedAt))
      .limit(10);

    const planDays = [] as GuestSupportView["planDays"];
    for (const day of days) {
      const [active] = await tx
        .select({ value: count() })
        .from(itineraryStops)
        .where(and(eq(itineraryStops.dayId, day.id), isNull(itineraryStops.supersededAt)));
      const [done] = await tx
        .select({ value: count() })
        .from(itineraryStops)
        .where(and(eq(itineraryStops.dayId, day.id), isNull(itineraryStops.supersededAt), isNotNull(itineraryStops.visitedAt)));
      planDays.push({
        dayNumber: day.dayNumber,
        generatedAt: day.generatedAt,
        completedAt: day.completedAt,
        activeStops: active.value,
        completedStops: done.value,
      });
    }

    const [visits] = await tx.select({ value: count() }).from(placeVisits).where(eq(placeVisits.userId, account.id));

    return {
      ok: true,
      view: {
        account: { id: account.id, role: account.role, createdAt: account.createdAt },
        activeStay: stay ?? null,
        planDays,
        verifiedPlaceCount: visits.value,
      },
    } as const;
  });
}
