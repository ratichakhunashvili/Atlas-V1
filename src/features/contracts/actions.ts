"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/lib/authorization";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import { findPlaceById } from "@/db/queries/places";
import {
  findContractById,
  loadContractFacts,
  proposeContract,
  setPlaceKind,
  transitionContract,
} from "@/db/operations/atlas-contracts";
import type { AdminAuditAction, AtlasContractStatus } from "@/db/schema";
import { validateConfirmationWindow } from "@/features/partnerships/rules";
import { confirmContractSchema, contractIdSchema, placeIdSchema, placeKindSchema } from "./schema";
import { contractStatusesThatCanTransitionTo, validateContractCandidate, validateKindChange } from "./rules";

/**
 * Atlas contracts and Place kinds (docs/catalogue-model-plan.md, phase C1). Every action calls requireAdmin() FIRST:
 * Server Actions are reachable by direct POST, so hiding a button is not authorization. Ids are validated and the
 * records re-loaded; nothing trusts a client-supplied status or kind beyond the validated enum.
 *
 * Phase C1 changes no guest behaviour: services/eligibility does not read contracts or kinds yet.
 */

const CONTRACTS_PATH = "/admin/contracts";

const KIND_LABEL = { business: "a business", attraction: "an attraction", hotel: "a hotel" } as const;

function finish(outcome: { error: string } | { ok: string }): never {
  revalidatePath(CONTRACTS_PATH);
  const query = "error" in outcome ? `error=${encodeURIComponent(outcome.error)}` : `ok=${encodeURIComponent(outcome.ok)}`;
  redirect(`${CONTRACTS_PATH}?${query}`);
}

/** Propose a contract for a business. It always starts pending_review. */
export async function proposeContractAction(placeId: string) {
  const admin = await requireAdmin();

  const id = placeIdSchema.safeParse(placeId);
  if (!id.success) finish({ error: "Invalid place." });
  const place = await findPlaceById(id.data);
  if (!place) finish({ error: "That place no longer exists." });

  const facts = await loadContractFacts(db, place.id);
  const problem = validateContractCandidate({ place, ...facts });
  if (problem) finish({ error: problem });

  const created = await proposeContract(db, place.id);
  if (!created) finish({ error: "This place already has a contract waiting for review." });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "contract.proposed",
    targetType: "atlas_partner_contract",
    targetId: created.id,
    after: { status: "pending_review", placeId: place.id },
  });

  finish({ ok: `Contract for ${place.name} added as pending review.` });
}

/** The explicit admin confirmation: the ONLY path to `active` (from pending_review, or resuming a suspended one). */
export async function confirmContractAction(contractId: string, formData: FormData) {
  const admin = await requireAdmin();

  const id = contractIdSchema.safeParse(contractId);
  if (!id.success) finish({ error: "Invalid contract." });
  const existing = await findContractById(db, id.data);
  if (!existing) finish({ error: "That contract no longer exists." });

  const parsed = confirmContractSchema.safeParse({ startsAt: formData.get("startsAt") ?? "", endsAt: formData.get("endsAt") ?? "" });
  if (!parsed.success) finish({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const now = new Date();
  const windowProblem = validateConfirmationWindow({ ...parsed.data, now });
  if (windowProblem) finish({ error: windowProblem });

  const place = await findPlaceById(existing.placeId);
  if (!place) finish({ error: "That place no longer exists." });
  if (place.archivedAt !== null) finish({ error: "This place is archived. Unarchive it before confirming its contract." });
  if (place.kind !== "business") finish({ error: "Only a business can have an active Atlas contract." });

  const updated = await transitionContract(db, existing.id, contractStatusesThatCanTransitionTo("active"), {
    status: "active",
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    confirmedBy: admin.id,
    confirmedAt: now,
  }, now);
  if (!updated) finish({ error: "This contract can't be confirmed: it changed status, or the place already has an active contract." });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "contract.confirmed",
    targetType: "atlas_partner_contract",
    targetId: existing.id,
    before: { status: existing.status },
    after: {
      status: "active",
      startsAt: parsed.data.startsAt?.toISOString() ?? null,
      endsAt: parsed.data.endsAt?.toISOString() ?? null,
    },
  });

  finish({ ok: `Contract for ${place.name} confirmed.` });
}

const AUDIT_FOR_TARGET = {
  suspended: "contract.suspended",
  ended: "contract.ended",
} as const satisfies Partial<Record<AtlasContractStatus, AdminAuditAction>>;

async function simpleTransition(contractId: string, to: keyof typeof AUDIT_FOR_TARGET, okMessage: string) {
  const admin = await requireAdmin();

  const id = contractIdSchema.safeParse(contractId);
  if (!id.success) finish({ error: "Invalid contract." });
  const existing = await findContractById(db, id.data);
  if (!existing) finish({ error: "That contract no longer exists." });

  const now = new Date();
  const patch = to === "ended" ? { status: to, endedAt: now } : { status: to };
  const updated = await transitionContract(db, existing.id, contractStatusesThatCanTransitionTo(to), patch, now);
  if (!updated) finish({ error: `This contract can't move to "${to}" from its current status.` });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: AUDIT_FOR_TARGET[to],
    targetType: "atlas_partner_contract",
    targetId: existing.id,
    before: { status: existing.status },
    after: { status: to },
  });

  finish({ ok: okMessage });
}

export async function suspendContractAction(contractId: string) {
  return simpleTransition(contractId, "suspended", "Contract suspended.");
}

export async function endContractAction(contractId: string) {
  return simpleTransition(contractId, "ended", "Contract ended. It stays in the history.");
}

/** Sets a Place's kind as an explicit admin decision, which also confirms a backfilled suggestion. */
export async function setPlaceKindAction(placeId: string, formData: FormData) {
  const admin = await requireAdmin();

  const id = placeIdSchema.safeParse(placeId);
  if (!id.success) finish({ error: "Invalid place." });
  const place = await findPlaceById(id.data);
  if (!place) finish({ error: "That place no longer exists." });

  const parsed = placeKindSchema.safeParse({ kind: formData.get("kind") ?? "" });
  if (!parsed.success) finish({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

  const facts = await loadContractFacts(db, place.id);
  const problem = validateKindChange({ to: parsed.data.kind, ...facts });
  if (problem) finish({ error: problem });

  const updated = await setPlaceKind(db, place.id, parsed.data.kind);
  if (!updated) finish({ error: "That place no longer exists." });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "place.kind_changed",
    targetType: "place",
    targetId: place.id,
    before: { kind: place.kind, kindConfirmed: place.kindConfirmedAt !== null },
    after: { kind: parsed.data.kind, kindConfirmed: true },
  });

  finish({ ok: `${place.name} is now marked as ${KIND_LABEL[parsed.data.kind]}.` });
}
