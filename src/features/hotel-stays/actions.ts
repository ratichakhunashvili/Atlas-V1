"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization";
import {
  createHotelStay,
  findActiveStayForUser,
  stayHasItineraryDays,
  switchActiveStay,
  updateStayDates,
} from "@/db/queries/hotel-stays";
import { findHotelById } from "@/db/queries/hotels";
import { findQrCredentialByHash } from "@/db/queries/qr-credentials";
import {
  clearPendingHotelSwitch,
  findPendingHotelSwitch,
  recordPendingHotelSwitch,
} from "@/db/queries/pending-hotel-switches";
import { resolveScannedQrToken } from "@/services/qr";
import { checkAttemptAllowed, recordFailedAttempt } from "@/db/queries/rate-limit";
import { rateLimitedMessage } from "@/services/rate-limit/policy";
import { decideHotelEntry } from "@/services/stays/hotel-entry";
import { validateStayDates } from "@/services/stays/stay-dates";
import { checkInTokenSchema } from "./schema";

type HotelSummary = { id: string; name: string };

export type HotelEntryResult =
  /** "not_started" is a READ: the code is valid and nothing has been written yet. */
  | { ok: true; status: "entered" | "already_here" | "not_started"; hotel: HotelSummary }
  /**
   * The guest is staying somewhere else. No stay has been written; a pending
   * switch has been recorded server-side and the guest is asked to confirm.
   * The scanned token is finished with at this point and is not carried forward.
   */
  | { ok: true; status: "switch_required"; currentHotel: HotelSummary; scannedHotel: HotelSummary }
  | { ok: false; error: string };

/** The confirm path never asks another question: it either acts or reports why it could not. */
export type HotelSwitchOutcome = Exclude<HotelEntryResult, { status: "switch_required" }>;

export type PendingSwitch = { currentHotel: HotelSummary; scannedHotel: HotelSummary };

/**
 * Resolves a scanned hotel-entry credential to its hotel, server-side.
 *
 * Every failure — unknown, revoked, expired, or a Place check-in code presented
 * here — returns the same message on purpose: telling a scanner *why* a code was
 * refused tells an attacker which codes exist. services/qr keeps the specific
 * reason for tests and logs.
 */
async function resolveHotelFromToken(rawToken: string, now: Date) {
  const parsed = checkInTokenSchema.safeParse({ token: rawToken });
  if (!parsed.success) return null;

  const resolution = await resolveScannedQrToken(parsed.data.token, "hotel_entry", findQrCredentialByHash, now);
  if (!resolution.ok || !resolution.credential.hotelId) return null;

  return findHotelById(resolution.credential.hotelId);
}

/**
 * READ-ONLY: what this scanned code means for this guest, right now.
 *
 * Nothing is written. The scan landing (/checkin/[token]) is a GET, and a GET that
 * mutates is a GET that fires again on a reload, a prefetch, or a link preview —
 * none of which is the guest deciding anything. So the page renders what the code
 * means and waits for an explicit action.
 */
export async function previewHotelEntryByToken(rawToken: string, now: Date = new Date()): Promise<HotelEntryResult> {
  const user = await requireUser();

  const hotel = await resolveHotelFromToken(rawToken, now);
  if (!hotel) {
    return { ok: false, error: "That code isn't a valid hotel entry code." };
  }

  const existingStay = await findActiveStayForUser(user.id);
  const decision = decideHotelEntry(
    existingStay ? { hotelId: existingStay.hotel.id, hotelName: existingStay.place.name } : null,
    hotel.id
  );

  if (decision.action === "already_here") {
    return { ok: true, status: "already_here", hotel: { id: hotel.id, name: hotel.place.name } };
  }

  if (decision.action === "switch_required") {
    return {
      ok: true,
      status: "switch_required",
      currentHotel: { id: decision.from.hotelId, name: decision.from.hotelName },
      scannedHotel: { id: hotel.id, name: hotel.place.name },
    };
  }

  return { ok: true, status: "not_started", hotel: { id: hotel.id, name: hotel.place.name } };
}

/**
 * The WRITE half, reached only from an explicit button on the scan landing.
 *
 * Starts the stay when the guest has none. When they are staying elsewhere it does
 * NOT switch them: it records the verified hotel as a pending switch and sends them
 * to the tokenless confirmation screen, so ending a stay still takes its own
 * deliberate yes.
 */
export async function enterHotelByToken(rawToken: string, now: Date = new Date()): Promise<HotelEntryResult> {
  const user = await requireUser();

  /*
   * Throttled here, on the WRITE path, and deliberately not on
   * previewHotelEntryByToken: that read-only GET runs on every scan, reload and
   * back-button, and charging it would throttle a guest for merely looking at
   * their own hotel's code.
   *
   * Only failures count, so scanning the right code repeatedly is free. The
   * refusal below is the same generic sentence whatever went wrong — a message
   * that distinguished "no such code" from "code for another hotel" would turn
   * this endpoint into a way to enumerate codes.
   */
  const allowed = await checkAttemptAllowed({ scope: "hotel_entry", actorId: user.id, now });
  if (!allowed.allowed) {
    return { ok: false, error: rateLimitedMessage() };
  }

  const hotel = await resolveHotelFromToken(rawToken, now);
  if (!hotel) {
    await recordFailedAttempt({ scope: "hotel_entry", actorId: user.id, now });
    return { ok: false, error: "That code isn't a valid hotel entry code." };
  }

  const existingStay = await findActiveStayForUser(user.id);
  const decision = decideHotelEntry(
    existingStay ? { hotelId: existingStay.hotel.id, hotelName: existingStay.place.name } : null,
    hotel.id
  );

  if (decision.action === "already_here") {
    // A stray pending switch from an earlier scan must not outlive this one.
    await clearPendingHotelSwitch(user.id);
    return { ok: true, status: "already_here", hotel: { id: hotel.id, name: hotel.place.name } };
  }

  if (decision.action === "switch_required") {
    await recordPendingHotelSwitch({ userId: user.id, hotelId: hotel.id, now });
    return {
      ok: true,
      status: "switch_required",
      currentHotel: { id: decision.from.hotelId, name: decision.from.hotelName },
      scannedHotel: { id: hotel.id, name: hotel.place.name },
    };
  }

  const created = await createHotelStay({ userId: user.id, hotelId: hotel.id, checkIn: now });
  if (!created) {
    // Lost a race with a concurrent entry — report the stay that won instead of failing.
    const stay = await findActiveStayForUser(user.id);
    if (stay) {
      return { ok: true, status: "already_here", hotel: { id: stay.hotel.id, name: stay.place.name } };
    }
    return { ok: false, error: "Could not check in right now. Please try again." };
  }

  await clearPendingHotelSwitch(user.id);
  return { ok: true, status: "entered", hotel: { id: hotel.id, name: hotel.place.name } };
}

/** What the confirmation screen shows. Read from the server-held pending switch — the browser sends nothing. */
export async function getPendingHotelSwitch(now: Date = new Date()): Promise<PendingSwitch | null> {
  const user = await requireUser();

  const pending = await findPendingHotelSwitch(user.id, now);
  if (!pending) return null;

  const existingStay = await findActiveStayForUser(user.id);
  // No current stay, or the guest is already at the pending hotel: there is
  // nothing left to confirm, and a stale question must not be shown.
  if (!existingStay || existingStay.hotel.id === pending.hotelId) return null;

  return {
    currentHotel: { id: existingStay.hotel.id, name: existingStay.place.name },
    scannedHotel: { id: pending.hotelId, name: pending.hotelName },
  };
}

/**
 * The confirmed half of a hotel switch. Takes NO input: the hotel comes from the
 * guest's own pending switch, which only a verified scan could have created, and
 * which expires. Nothing a browser sends — token, hotel id or form value — takes
 * part in choosing the hotel.
 *
 * Closing the old stay and opening the new one is a single transaction
 * (db/operations/hotel-stays.ts).
 */
export async function confirmPendingHotelSwitch(now: Date = new Date()): Promise<HotelSwitchOutcome> {
  const user = await requireUser();

  const pending = await findPendingHotelSwitch(user.id, now);
  if (!pending) {
    return { ok: false, error: "That request expired. Scan the hotel's code again." };
  }

  const existingStay = await findActiveStayForUser(user.id);
  const decision = decideHotelEntry(
    existingStay ? { hotelId: existingStay.hotel.id, hotelName: existingStay.place.name } : null,
    pending.hotelId
  );

  if (decision.action === "already_here") {
    await clearPendingHotelSwitch(user.id);
    return { ok: true, status: "already_here", hotel: { id: pending.hotelId, name: pending.hotelName } };
  }

  if (decision.action === "create_stay") {
    // The old stay ended between scanning and confirming: start the new one directly.
    const created = await createHotelStay({ userId: user.id, hotelId: pending.hotelId, checkIn: now });
    await clearPendingHotelSwitch(user.id);
    if (!created) {
      const stay = await findActiveStayForUser(user.id);
      if (stay) return { ok: true, status: "already_here", hotel: { id: stay.hotel.id, name: stay.place.name } };
      return { ok: false, error: "Could not check in right now. Please try again." };
    }
    return { ok: true, status: "entered", hotel: { id: pending.hotelId, name: pending.hotelName } };
  }

  const switched = await switchActiveStay({ userId: user.id, toHotelId: pending.hotelId, now });
  await clearPendingHotelSwitch(user.id);

  if (!switched) {
    const stay = await findActiveStayForUser(user.id);
    if (stay) {
      return { ok: true, status: "already_here", hotel: { id: stay.hotel.id, name: stay.place.name } };
    }
    return { ok: false, error: "Could not switch hotels right now. Please try again." };
  }

  return { ok: true, status: "entered", hotel: { id: pending.hotelId, name: pending.hotelName } };
}

/*
 * Why no revalidatePath in the functions above: /checkin/[token] calls
 * checkInToHotelByToken during a Server Component RENDER, and the Next docs
 * (node_modules/next/dist/docs/.../revalidatePath.md) scope revalidatePath to
 * Server Functions and Route Handlers. Both entry paths redirect to "/", which is
 * a dynamic route and re-renders anyway, so the cache hint was doing no work there.
 * The form wrappers below are genuine Server Functions and keep it.
 */

/**
 * Form-bound wrapper for manual token entry on the home page. On a required
 * switch it redirects to the tokenless confirmation screen — the typed code is
 * consumed here and never put in a URL.
 */
export async function checkInToHotelFormAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  // A form POST is already an explicit action, so this writes directly.
  const result = await enterHotelByToken(token);
  if (result.ok && result.status === "entered") revalidatePath("/");

  if (!result.ok) {
    redirect(`/?checkinError=${encodeURIComponent(result.error)}`);
  }

  if (result.status === "switch_required") {
    redirect("/checkin/confirm");
  }

  redirect(`/?checkinOk=${encodeURIComponent(result.hotel.name)}`);
}

/** The "Start my stay" button on the scan landing: the explicit action its read-only GET waits for. */
export async function enterHotelFormAction(token: string) {
  const result = await enterHotelByToken(token);
  if (result.ok && result.status === "entered") revalidatePath("/");

  if (!result.ok) {
    redirect(`/?checkinError=${encodeURIComponent(result.error)}`);
  }

  if (result.status === "switch_required") {
    redirect("/checkin/confirm");
  }

  redirect(`/?checkinOk=${encodeURIComponent(result.hotel.name)}`);
}

/** Confirm button on the switch screen. Takes no arguments: the hotel comes from the guest's own pending switch. */
export async function confirmHotelSwitchFormAction() {
  const result = await confirmPendingHotelSwitch();
  if (result.ok && result.status === "entered") revalidatePath("/");

  if (!result.ok) {
    redirect(`/?checkinError=${encodeURIComponent(result.error)}`);
  }

  redirect(`/?checkinOk=${encodeURIComponent(result.hotel.name)}`);
}

/** "Stay where I am": drops the pending switch so a reopened tab cannot confirm it later. */
export async function cancelHotelSwitchFormAction() {
  const user = await requireUser();
  await clearPendingHotelSwitch(user.id);
  redirect("/");
}

export type StayDatesFormState = { ok: boolean; message: string } | null;

/**
 * Saves the guest's declared arrival and departure dates on their own active stay.
 *
 * The stay is resolved from the authenticated user — the form carries two dates and nothing else, so there is no
 * stay or hotel id to forge. The rules (range, order, length, arrival lock) are a pure function; the database
 * write re-checks ownership, activity and that the dates were not verified by a stronger source.
 *
 * These are the guest's own words: saving them never marks them verified.
 */
export async function updateStayDatesFormAction(
  _previous: StayDatesFormState,
  formData: FormData
): Promise<StayDatesFormState> {
  const user = await requireUser();

  const stay = await findActiveStayForUser(user.id);
  if (!stay) return { ok: false, message: "You don't have an active stay. Scan your hotel's QR code first." };

  if (stay.datesSource !== "guest_declared") {
    return { ok: false, message: "These dates came from a verified source and can't be changed here." };
  }

  const validation = validateStayDates({
    checkIn: formData.get("checkIn"),
    expectedCheckOut: formData.get("expectedCheckOut"),
    now: new Date(),
    currentCheckIn: stay.checkIn,
    arrivalLocked: await stayHasItineraryDays({ userId: user.id, hotelId: stay.hotel.id }),
  });
  if (!validation.ok) return { ok: false, message: validation.message };

  const saved = await updateStayDates({
    userId: user.id,
    stayId: stay.id,
    checkIn: validation.checkIn,
    expectedCheckOut: validation.expectedCheckOut,
  });
  if (!saved) return { ok: false, message: "Your stay changed while you were editing. Please try again." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Dates saved. They're what you told us — Atlas hasn't verified them with your hotel." };
}
