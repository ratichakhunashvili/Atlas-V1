"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import { createPendingPartnership, findPartnershipById, transitionPartnership, updatePartnershipPromotion } from "@/db/queries/hotel-partnerships";
import { findFacilityByPlaceId } from "@/db/queries/hotel-facilities";
import { findHotelById } from "@/db/queries/hotels";
import { findPlaceById } from "@/db/queries/places";
import { db } from "@/db";
import { loadContractFacts } from "@/db/operations/atlas-contracts";
import type { AdminAuditAction, PartnershipStatus } from "@/db/schema";
import { addPartnershipSchema, confirmPartnershipSchema, hotelIdSchema, partnershipIdSchema, promotionSchema } from "./schema";
import { statusesThatCanTransitionTo, validateConfirmationWindow, validatePartnerCandidate } from "./rules";

/**
 * Every action here calls requireAdmin() FIRST — Server Actions are reachable
 * by direct POST, so hiding the buttons is not authorization. Ids come from
 * validated inputs or are re-loaded from the database; nothing here trusts a
 * client-supplied hotelId on an existing partnership.
 */

function partnershipsPath(hotelId: string) {
  return `/admin/hotels/${hotelId}/partnerships`;
}

function finish(hotelId: string, outcome: { error: string } | { ok: string }): never {
  revalidatePath(partnershipsPath(hotelId));
  const query = "error" in outcome ? `error=${encodeURIComponent(outcome.error)}` : `ok=${encodeURIComponent(outcome.ok)}`;
  redirect(`${partnershipsPath(hotelId)}?${query}`);
}

/** Propose a partner. It always starts `pending_review` — it is NOT eligible until an admin confirms it. */
export async function addPartnershipAction(hotelId: string, formData: FormData) {
  const admin = await requireAdmin();

  const hotelIdParsed = hotelIdSchema.safeParse(hotelId);
  if (!hotelIdParsed.success) redirect("/admin/hotels");
  const hotel = await findHotelById(hotelIdParsed.data);
  if (!hotel) redirect("/admin/hotels");

  const parsed = addPartnershipSchema.safeParse({ placeId: formData.get("placeId") ?? "" });
  if (!parsed.success) finish(hotel.id, { error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const place = await findPlaceById(parsed.data.placeId);
  if (!place) finish(hotel.id, { error: "That place no longer exists." });

  const facility = await findFacilityByPlaceId(place.id);
  const contractFacts = await loadContractFacts(db, place.id);
  const problem = validatePartnerCandidate({
    hotelPlaceId: hotel.placeId,
    place,
    isHotelFacility: facility !== null,
    isHotelAnchor: contractFacts.isHotelAnchor,
    hasContractInForce: contractFacts.hasContractInForce,
  });
  if (problem) finish(hotel.id, { error: problem });

  const created = await createPendingPartnership({ hotelId: hotel.id, placeId: place.id });
  if (!created) finish(hotel.id, { error: "This place already has a promotion record with this hotel." });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "partnership.proposed",
    targetType: "hotel_partnership",
    targetId: created.id,
    hotelId: hotel.id,
    after: { status: "pending_review", placeId: place.id },
  });

  finish(hotel.id, { ok: "Promotion added as pending review. It takes effect for this hotel's guests once you confirm it." });
}

/** The explicit admin confirmation: the ONLY path that makes a partnership `active` (and therefore eligible). */
export async function confirmPartnershipAction(partnershipId: string, formData: FormData) {
  const admin = await requireAdmin();

  const id = partnershipIdSchema.safeParse(partnershipId);
  if (!id.success) redirect("/admin/hotels");
  const existing = await findPartnershipById(id.data);
  if (!existing) redirect("/admin/hotels");

  const parsed = confirmPartnershipSchema.safeParse({
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
    priority: formData.get("priority") ?? "",
  });
  if (!parsed.success) finish(existing.hotelId, { error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const now = new Date();
  const windowProblem = validateConfirmationWindow({ startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, now });
  if (windowProblem) finish(existing.hotelId, { error: windowProblem });

  const place = await findPlaceById(existing.placeId);
  const hotel = await findHotelById(existing.hotelId);
  if (!place || !hotel) finish(existing.hotelId, { error: "The hotel or place no longer exists." });
  const facility = await findFacilityByPlaceId(place.id);
  const contractFacts = await loadContractFacts(db, place.id, now);
  const candidateProblem = validatePartnerCandidate({
    hotelPlaceId: hotel.placeId,
    place,
    isHotelFacility: facility !== null,
    isHotelAnchor: contractFacts.isHotelAnchor,
    hasContractInForce: contractFacts.hasContractInForce,
  });
  if (candidateProblem) finish(existing.hotelId, { error: candidateProblem });

  const updated = await transitionPartnership(existing.id, statusesThatCanTransitionTo("active"), {
    status: "active",
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    priority: parsed.data.priority,
    confirmedBy: admin.id,
    confirmedAt: now,
    revokedAt: null,
  });
  if (!updated) finish(existing.hotelId, { error: "This promotion can't be confirmed from its current status." });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "partnership.confirmed",
    targetType: "hotel_partnership",
    targetId: existing.id,
    hotelId: existing.hotelId,
    before: { status: existing.status },
    after: {
      status: "active",
      startsAt: parsed.data.startsAt?.toISOString() ?? null,
      endsAt: parsed.data.endsAt?.toISOString() ?? null,
      priority: parsed.data.priority ?? null,
    },
  });

  finish(existing.hotelId, { ok: "Promotion confirmed. This hotel's guests now see this Atlas partner promoted." });
}

/** Which audited action each transition target maps to. "active" is only ever reached through confirm, which audits itself. */
const AUDIT_FOR_TARGET = {
  suspended: "partnership.suspended",
  revoked: "partnership.revoked",
  pending_review: "partnership.reopened",
  active: "partnership.confirmed",
} as const satisfies Record<PartnershipStatus, AdminAuditAction>;

async function simpleTransition(
  partnershipId: string,
  to: PartnershipStatus,
  patch: Parameters<typeof transitionPartnership>[2],
  okMessage: string
) {
  const admin = await requireAdmin();

  const id = partnershipIdSchema.safeParse(partnershipId);
  if (!id.success) redirect("/admin/hotels");
  const existing = await findPartnershipById(id.data);
  if (!existing) redirect("/admin/hotels");

  const updated = await transitionPartnership(existing.id, statusesThatCanTransitionTo(to), { status: to, ...patch });
  if (!updated) finish(existing.hotelId, { error: `This promotion can't move to "${to}" from its current status.` });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: AUDIT_FOR_TARGET[to],
    targetType: "hotel_partnership",
    targetId: existing.id,
    hotelId: existing.hotelId,
    before: { status: existing.status },
    after: { status: to },
  });

  finish(existing.hotelId, { ok: okMessage });
}

export async function suspendPartnershipAction(partnershipId: string) {
  return simpleTransition(partnershipId, "suspended", {}, "Promotion suspended. The place stays visible to guests, without this hotel's promotion.");
}

export async function revokePartnershipAction(partnershipId: string) {
  return simpleTransition(partnershipId, "revoked", { revokedAt: new Date() }, "Promotion revoked. The place stays visible to guests, without this hotel's promotion.");
}

/** Re-open a revoked partnership as pending_review (clearing the old confirmation) — it needs a fresh explicit confirmation. */
export async function reopenPartnershipAction(partnershipId: string) {
  return simpleTransition(
    partnershipId,
    "pending_review",
    { confirmedAt: null, confirmedBy: null, revokedAt: null },
    "Promotion re-opened as pending review."
  );
}

/**
 * Featured / offer for one hotel's partnership. Ranking and presentation only: status, dates and confirmation are
 * untouched, so this can never make a partner visible to guests (or hide one).
 */
export async function updatePartnershipPromotionAction(partnershipId: string, formData: FormData) {
  const admin = await requireAdmin();

  const idParsed = partnershipIdSchema.safeParse(partnershipId);
  if (!idParsed.success) redirect("/admin/hotels");
  const existing = await findPartnershipById(idParsed.data);
  if (!existing) redirect("/admin/hotels");

  const parsed = promotionSchema.safeParse({
    featured: formData.get("featured") === "on",
    offerText: String(formData.get("offerText") ?? ""),
  });
  if (!parsed.success) finish(existing.hotelId, { error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const updated = await updatePartnershipPromotion(existing.id, parsed.data);
  if (!updated) finish(existing.hotelId, { error: "That promotion no longer exists." });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "partnership.promotion_changed",
    targetType: "hotel_partnership",
    targetId: existing.id,
    hotelId: existing.hotelId,
    before: { featured: existing.featured, offerText: existing.offerText },
    after: parsed.data,
  });

  finish(existing.hotelId, { ok: parsed.data.featured ? "Saved. This place is featured for this hotel's guests." : "Saved." });
}
