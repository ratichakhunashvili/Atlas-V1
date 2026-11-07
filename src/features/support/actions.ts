"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/authorization";
import { lookupGuestForSupport, moveGuestToHotel } from "@/db/queries/guest-support";
import { reserveAttempt } from "@/db/queries/rate-limit";
import { rateLimitedMessage } from "@/services/rate-limit/policy";

/** Plain, serialisable strings only: this crosses to a client component. */
export type SupportLookupState =
  | null
  | { ok: false; message: string }
  | {
      ok: true;
      account: { role: string; createdAt: string };
      activeStay: { hotelName: string; checkIn: string; expectedCheckOut: string | null; datesSource: string } | null;
      planDays: Array<{ dayNumber: number; generatedAt: string; completed: boolean; activeStops: number; completedStops: number }>;
      verifiedPlaceCount: number;
    };

const lookupSchema = z.object({
  email: z.email("Enter the guest's exact email address"),
  reason: z.string().min(1, "Choose why you are looking at this guest"),
  note: z.string().max(200, "Keep the note under 200 characters").optional(),
});

/**
 * Guest support lookup. Admin-only, rate-limited (it is sensitive access, so it cannot become bulk browsing),
 * exact-email only, requires an operational reason, and is audited in the same transaction as the read. What comes
 * back is the minimum needed to resolve a request — see db/operations/guest-support.ts for what is deliberately left out.
 */
export async function lookupGuestAction(_previous: SupportLookupState, formData: FormData): Promise<SupportLookupState> {
  const admin = await requireAdmin();

  const parsed = lookupSchema.safeParse({
    email: formData.get("email") ?? "",
    reason: formData.get("reason") ?? "",
    note: (formData.get("note") as string | null) ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };

  const reserved = await reserveAttempt({ scope: "support_lookup", actorId: admin.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, message: rateLimitedMessage() };

  const result = await lookupGuestForSupport({
    actorUserId: admin.id,
    email: parsed.data.email,
    reasonCode: parsed.data.reason,
    note: parsed.data.note,
  });
  if (!result.ok) return { ok: false, message: result.message };

  const { view } = result;
  return {
    ok: true,
    account: { role: view.account.role, createdAt: view.account.createdAt.toISOString() },
    activeStay: view.activeStay
      ? {
          hotelName: view.activeStay.hotelName,
          checkIn: view.activeStay.checkIn.toISOString(),
          expectedCheckOut: view.activeStay.expectedCheckOut?.toISOString() ?? null,
          datesSource: view.activeStay.datesSource,
        }
      : null,
    planDays: view.planDays.map((day) => ({
      dayNumber: day.dayNumber,
      generatedAt: day.generatedAt.toISOString(),
      completed: day.completedAt !== null,
      activeStops: day.activeStops,
      completedStops: day.completedStops,
    })),
    verifiedPlaceCount: view.verifiedPlaceCount,
  };
}

export type MoveGuestState = null | { ok: boolean; message: string };

const moveSchema = z.object({
  email: z.email("Look the guest up first"),
  hotelId: z.uuid("Choose a hotel"),
  reason: z.string().min(1, "Choose why you are moving this guest"),
  note: z.string().max(200, "Keep the note under 200 characters").optional(),
});

/**
 * Moves a guest's active stay to another hotel, so it becomes their base. Admin-only and rate-limited like the lookup;
 * the hotel is re-checked on the server (published, verified, not archived) and the move is audited with the reason.
 */
export async function moveGuestAction(_previous: MoveGuestState, formData: FormData): Promise<MoveGuestState> {
  const admin = await requireAdmin();

  const parsed = moveSchema.safeParse({
    email: formData.get("email") ?? "",
    hotelId: formData.get("hotelId") ?? "",
    reason: formData.get("reason") ?? "",
    note: (formData.get("note") as string | null) || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };

  const reserved = await reserveAttempt({ scope: "support_lookup", actorId: admin.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, message: rateLimitedMessage() };

  const result = await moveGuestToHotel({
    actorUserId: admin.id,
    email: parsed.data.email,
    toHotelId: parsed.data.hotelId,
    reasonCode: parsed.data.reason,
    note: parsed.data.note,
  });
  if (!result.ok) return { ok: false, message: result.message };
  if (result.status === "already_there") return { ok: true, message: `The guest is already staying at ${result.hotelName}.` };
  return {
    ok: true,
    message: result.fromHotelName
      ? `Moved from ${result.fromHotelName} to ${result.hotelName}. ${result.hotelName} is now the guest's base.`
      : `${result.hotelName} is now the guest's base.`,
  };
}
