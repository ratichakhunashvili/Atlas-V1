"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/lib/authorization";
import { isUuid } from "@/lib/route-ids";
import { countHotelDeletionBlockers, deleteHotel, findHotelById } from "@/db/queries/hotels";
import { createHotelWithAudit, updateHotelPlaceWithAudit } from "@/db/operations/hotel-admin";
import { hasHotelDeletionBlockers, hotelDeletionBlockedMessage } from "@/db/operations/hotel-deletion";
import { loadContractFacts } from "@/db/operations/atlas-contracts";
import { placeHasPartnershipRows } from "@/db/queries/hotel-partnerships";
import { findPlaceById } from "@/db/queries/places";
import { hasPgErrorCode, PG_UNIQUE_VIOLATION } from "@/db/errors";
import { hotelSchema } from "./schema";
import { validateHotelPlaceCandidate } from "./rules";

// The hotel list is the admin home, /admin. Every hotel action reports back with ?ok= or ?error=.
const HOTELS_PATH = "/admin";

function withMessage(path: string, outcome: { ok: string } | { error: string }) {
  const query = "error" in outcome ? `error=${encodeURIComponent(outcome.error)}` : `ok=${encodeURIComponent(outcome.ok)}`;
  return `${path}?${query}`;
}

/** Why `placeId` can't be this hotel's place, or null. `hotelId` is the hotel being edited (none when creating). */
async function hotelPlaceProblem(placeId: string, hotelId: string | null): Promise<string | null> {
  const place = await findPlaceById(placeId);
  if (!place) return "That place no longer exists.";
  const facts = await loadContractFacts(db, place.id);
  const current = hotelId ? await findHotelById(hotelId) : null;
  return validateHotelPlaceCandidate({
    place,
    belongsToAnotherHotel: facts.isHotelAnchor && current?.placeId !== place.id,
    isHotelFacility: facts.isHotelFacility,
    hasPartnershipRows: await placeHasPartnershipRows(place.id),
    hasLiveContract: facts.hasLiveContract,
  });
}

export async function createHotelAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = hotelSchema.safeParse({ placeId: formData.get("placeId") ?? "" });
  if (!parsed.success) redirect(withMessage("/admin/hotels/new", { error: parsed.error.issues[0]?.message ?? "Invalid input" }));

  const problem = await hotelPlaceProblem(parsed.data.placeId, null);
  if (problem) redirect(withMessage("/admin/hotels/new", { error: problem }));

  // No entry credential is minted here. A hotel starts with none, and an admin
  // issues one deliberately from its edit page, where the raw code is shown once.
  // The hotel and its `hotel.created` audit entry are written in one transaction.
  try {
    await createHotelWithAudit(db, { actorUserId: admin.id, placeId: parsed.data.placeId });
  } catch (error) {
    // Two admins choosing the same place at once: the unique index decides, and the loser gets a sentence.
    if (!hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) throw error;
    redirect(withMessage("/admin/hotels/new", { error: "This place already belongs to another hotel." }));
  }

  revalidatePath(HOTELS_PATH);
  redirect(withMessage(HOTELS_PATH, { ok: "Hotel created. Issue its hotel code from the hotel's page." }));
}

export async function updateHotelAction(id: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!isUuid(id)) redirect(HOTELS_PATH);

  const editPath = `/admin/hotels/${id}`;
  const parsed = hotelSchema.safeParse({ placeId: formData.get("placeId") ?? "" });
  if (!parsed.success) redirect(withMessage(editPath, { error: parsed.error.issues[0]?.message ?? "Invalid input" }));

  const problem = await hotelPlaceProblem(parsed.data.placeId, id);
  if (problem) redirect(withMessage(editPath, { error: problem }));

  let updated;
  try {
    // The change and its `hotel.updated` audit entry are written in one transaction; saving the same place writes nothing.
    updated = await updateHotelPlaceWithAudit(db, { actorUserId: admin.id, hotelId: id, placeId: parsed.data.placeId });
  } catch (error) {
    if (!hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) throw error;
    redirect(withMessage(editPath, { error: "This place already belongs to another hotel." }));
  }
  if (!updated) redirect(withMessage(HOTELS_PATH, { error: "That hotel no longer exists." }));

  revalidatePath(HOTELS_PATH);
  revalidatePath(editPath);
  redirect(withMessage(editPath, { ok: "Hotel saved." }));
}

export async function deleteHotelAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect(HOTELS_PATH);

  /*
   * Refuse before deleting anything.
   *
   * Migration 0009 makes the database refuse as well — guest stays and itineraries
   * are now RESTRICT — but an admin deserves a sentence naming what is in the way
   * rather than a raw constraint error. And the hotel's OWN records (partnerships,
   * facilities, events, credentials) still cascade, so without this check they
   * would disappear with one click and no warning.
   */
  const blockers = await countHotelDeletionBlockers(id);
  if (hasHotelDeletionBlockers(blockers)) {
    redirect(withMessage(`/admin/hotels/${id}`, { error: hotelDeletionBlockedMessage(blockers) }));
  }

  await deleteHotel(id);

  revalidatePath(HOTELS_PATH);
  redirect(withMessage(HOTELS_PATH, { ok: "Hotel deleted." }));
}
