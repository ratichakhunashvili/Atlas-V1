"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { findFacilityById } from "@/db/queries/hotel-facilities";
import { addFacilityWithAudit, setFacilityStatusWithAudit } from "@/db/operations/hotel-facility-admin";
import { findHotelById } from "@/db/queries/hotels";
import { placeHasPartnershipRows } from "@/db/queries/hotel-partnerships";
import { findPlaceById } from "@/db/queries/places";
import { db } from "@/db";
import { loadContractFacts } from "@/db/operations/atlas-contracts";
import type { FacilityStatus } from "@/db/schema";
import { validateFacilityCandidate } from "@/features/partnerships/rules";
import { addFacilitySchema, facilityIdSchema, hotelIdSchema } from "./schema";

// requireAdmin() first in every action: Server Actions are reachable by
// direct POST, so a hidden button is not authorization.

function facilitiesPath(hotelId: string) {
  return `/admin/hotels/${hotelId}/facilities`;
}

function finish(hotelId: string, outcome: { error: string } | { ok: string }): never {
  revalidatePath(facilitiesPath(hotelId));
  const query = "error" in outcome ? `error=${encodeURIComponent(outcome.error)}` : `ok=${encodeURIComponent(outcome.ok)}`;
  redirect(`${facilitiesPath(hotelId)}?${query}`);
}

/** Register a hotel-OWNED facility. Eligible for this hotel's guests only — no external partnership involved. */
export async function addFacilityAction(hotelId: string, formData: FormData) {
  const admin = await requireAdmin();

  const hotelIdParsed = hotelIdSchema.safeParse(hotelId);
  if (!hotelIdParsed.success) redirect("/admin/hotels");
  const hotel = await findHotelById(hotelIdParsed.data);
  if (!hotel) redirect("/admin/hotels");

  const parsed = addFacilitySchema.safeParse({
    placeId: formData.get("placeId") ?? "",
    facilityType: formData.get("facilityType") ?? "",
  });
  if (!parsed.success) finish(hotel.id, { error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const place = await findPlaceById(parsed.data.placeId);
  if (!place) finish(hotel.id, { error: "That place no longer exists." });

  const problem = validateFacilityCandidate({
    hotelPlaceId: hotel.placeId,
    place,
    hasPartnershipRows: await placeHasPartnershipRows(place.id),
    isHotelAnchor: (await loadContractFacts(db, place.id)).isHotelAnchor,
  });
  if (problem) finish(hotel.id, { error: problem });

  // The facility and its `facility.added` audit entry are written in one transaction.
  const created = await addFacilityWithAudit(db, {
    actorUserId: admin.id,
    hotelId: hotel.id,
    placeId: place.id,
    facilityType: parsed.data.facilityType,
  });
  if (!created) finish(hotel.id, { error: "This place is already registered as a hotel facility." });

  finish(hotel.id, { ok: "Facility added." });
}

async function changeFacilityStatus(facilityId: string, status: FacilityStatus, okMessage: string) {
  const admin = await requireAdmin();

  const id = facilityIdSchema.safeParse(facilityId);
  if (!id.success) redirect("/admin/hotels");
  const existing = await findFacilityById(id.data);
  if (!existing) redirect("/admin/hotels");

  // The status change and its audit entry are written in one transaction; a repeated click changes and records nothing.
  await setFacilityStatusWithAudit(db, { actorUserId: admin.id, facilityId: existing.id, status });
  finish(existing.hotelId, { ok: okMessage });
}

export async function deactivateFacilityAction(facilityId: string) {
  return changeFacilityStatus(facilityId, "inactive", "Facility deactivated. Guests no longer see it.");
}

export async function activateFacilityAction(facilityId: string) {
  return changeFacilityStatus(facilityId, "active", "Facility activated.");
}
