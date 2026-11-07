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
import { isUniqueViolation } from "./hotel-stays";
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

export type MoveGuestResult =
  | { ok: true; status: "moved" | "already_there"; hotelName: string; fromHotelName: string | null }
  | { ok: false; reason: "not_found" | "invalid_reason" | "invalid_hotel" | "conflict"; message: string };

/**
 * Moves ONE guest's active stay to another hotel on a support request: the hotel that becomes their base ("home").
 *
 * Same shape as the guest's own QR switch (operations/hotel-stays.ts switchActiveStay): the old stay is closed — kept
 * as history, only `check_out` is set — and the new one opened in one transaction, so the guest never has zero or two
 * active stays. Plans belong to a hotel, so the guest starts a fresh plan at the new base; old plans and visits stay.
 *
 * Only a real hotel whose place is published, verified and not archived can be chosen. Reason required and audited in
 * the same transaction, with the before/after hotel. Moving a guest to the hotel they are already at changes nothing.
 */
export async function moveGuestToHotel(
  db: AtlasDatabase,
  input: { actorUserId: string; email: string; toHotelId: string; reasonCode: string; note?: string; now?: Date }
): Promise<MoveGuestResult> {
  const reason = SUPPORT_REASONS.find((entry) => entry.code === input.reasonCode);
  if (!reason) return { ok: false, reason: "invalid_reason", message: "Choose why you are moving this guest." };
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  const now = input.now ?? new Date();

  try {
    return await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(sql`lower(${users.email})`, input.email.trim().toLowerCase()))
        .limit(1);
      if (!account) return { ok: false, reason: "not_found", message: "No account has that email." } as const;

      const [hotel] = await tx
        .select({ id: hotels.id, name: places.name })
        .from(hotels)
        .innerJoin(places, eq(places.id, hotels.placeId))
        .where(
          and(
            eq(hotels.id, input.toHotelId),
            eq(places.publicationStatus, "published"),
            eq(places.verificationStatus, "verified"),
            isNull(places.archivedAt)
          )
        )
        .limit(1);
      if (!hotel) return { ok: false, reason: "invalid_hotel", message: "Choose a published, verified hotel." } as const;

      const [current] = await tx
        .select({ id: hotelStays.id, hotelId: hotelStays.hotelId, hotelName: places.name })
        .from(hotelStays)
        .innerJoin(hotels, eq(hotels.id, hotelStays.hotelId))
        .innerJoin(places, eq(places.id, hotels.placeId))
        .where(and(eq(hotelStays.userId, account.id), isNull(hotelStays.checkOut)))
        .limit(1);

      if (current?.hotelId === hotel.id) {
        return { ok: true, status: "already_there", hotelName: hotel.name, fromHotelName: current.hotelName } as const;
      }

      if (current) await tx.update(hotelStays).set({ checkOut: now }).where(eq(hotelStays.id, current.id));
      await tx.insert(hotelStays).values({ userId: account.id, hotelId: hotel.id, checkIn: now });

      await tx.insert(adminAuditEvents).values({
        actorUserId: input.actorUserId,
        action: "support.guest_moved",
        targetType: "user",
        targetId: account.id,
        hotelId: hotel.id,
        before: { hotelId: current?.hotelId ?? null },
        after: { hotelId: hotel.id },
        reason: note ? `${reason.code}: ${note}` : reason.code,
        occurredAt: now,
      });

      return { ok: true, status: "moved", hotelName: hotel.name, fromHotelName: current?.hotelName ?? null } as const;
    });
  } catch (error) {
    // A guest's own QR switch landed at the same moment: the one-active-stay index refused this one.
    if (isUniqueViolation(error)) return { ok: false, reason: "conflict", message: "The guest's stay changed just now. Look them up again." };
    throw error;
  }
}
