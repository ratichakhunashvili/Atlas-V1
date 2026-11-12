import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { PendingButton } from "@/components/admin/pending-button";
import { Button } from "@/components/shared/button";
import { Field } from "@/components/shared/field";
import { Select } from "@/components/shared/select";
import type { AtlasPartnerContract, PlaceKind } from "@/db/schema";
import {
  confirmContractAction,
  endContractAction,
  proposeContractAction,
  setPlaceKindAction,
  suspendContractAction,
} from "@/features/contracts/actions";

/*
 * Admin controls for one Place's kind and Atlas contracts (docs/catalogue-model-plan.md, phase C1). Shared by
 * /admin/contracts and the Place edit page. Every button posts to a server action that re-checks requireAdmin() and
 * the workflow rules; hiding a button here is presentation only.
 */

const KIND_OPTIONS: { value: PlaceKind; label: string }[] = [
  { value: "business", label: "Business (needs an Atlas contract)" },
  { value: "attraction", label: "Attraction (no contract)" },
  { value: "hotel", label: "Hotel (a hotel's own place)" },
];

function isoDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "—";
}

/** What the contract means today: "active" can still be outside its window. */
export function contractLabel(contract: AtlasPartnerContract, now: Date): string {
  if (contract.status === "active") {
    if (contract.endsAt && contract.endsAt.getTime() <= now.getTime()) return "Active (expired)";
    if (contract.startsAt && contract.startsAt.getTime() > now.getTime()) return "Active (scheduled)";
    return "Active";
  }
  if (contract.status === "pending_review") return "Pending review";
  if (contract.status === "suspended") return "Suspended";
  return "Ended";
}

/** Set on a Place's own page, so the actions bring the admin back there instead of to /admin/contracts. */
function ReturnTo({ path }: { path?: string }) {
  return path ? <input type="hidden" name="returnTo" value={path} /> : null;
}

export function PlaceKindForm({
  placeId,
  kind,
  confirmed,
  returnTo,
}: {
  placeId: string;
  kind: PlaceKind;
  confirmed: boolean;
  returnTo?: string;
}) {
  // "Hotel" is only for a hotel's own place, which Hotels creates; offering it elsewhere would always be refused.
  const options = kind === "hotel" ? KIND_OPTIONS : KIND_OPTIONS.filter((option) => option.value !== "hotel");
  return (
    <form action={setPlaceKindAction.bind(null, placeId)} className="flex flex-wrap items-end gap-2">
      <ReturnTo path={returnTo} />
      <div className="min-w-[14rem] flex-1">
        <Select label={confirmed ? "Kind" : "Kind (suggested, not confirmed yet)"} name="kind" id={`kind-${placeId}`} defaultValue={kind}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <Button variant="secondary" type="submit">
        {confirmed ? "Save kind" : "Confirm kind"}
      </Button>
    </form>
  );
}

export function ContractControls({
  placeId,
  kind,
  contracts,
  now,
  placeName,
  returnTo,
}: {
  placeId: string;
  kind: PlaceKind;
  contracts: AtlasPartnerContract[];
  now: Date;
  placeName: string;
  returnTo?: string;
}) {
  const hasOpen = contracts.some((contract) => contract.status === "pending_review" || contract.status === "active");

  return (
    <div className="space-y-3">
      {contracts.length === 0 ? <p className="text-sm text-slate-500">No Atlas contract.</p> : null}
      {contracts.map((contract) => (
        <div key={contract.id} className="space-y-2 rounded border border-slate-200 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{contractLabel(contract, now)}</p>
            <p className="text-xs text-slate-500">
              Starts {formatDate(contract.startsAt)} · Ends {formatDate(contract.endsAt)} · Confirmed {formatDate(contract.confirmedAt)}
              {contract.endedAt ? ` · Ended ${formatDate(contract.endedAt)}` : ""}
            </p>
          </div>

          {(contract.status === "pending_review" || contract.status === "suspended") && (
            <form action={confirmContractAction.bind(null, contract.id)} className="flex flex-wrap items-end gap-2">
              <ReturnTo path={returnTo} />
              <Field label="Starts (UTC date, optional)" name="startsAt" id={`startsAt-${contract.id}`} type="date" defaultValue={isoDate(contract.startsAt)} />
              <Field label="Ends (UTC date, optional)" name="endsAt" id={`endsAt-${contract.id}`} type="date" defaultValue={isoDate(contract.endsAt)} />
              <PendingButton pendingLabel={contract.status === "suspended" ? "Resuming…" : "Confirming…"}>
                {contract.status === "suspended" ? "Resume contract" : "Confirm contract"}
              </PendingButton>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {contract.status === "active" && (
              <form action={suspendContractAction.bind(null, contract.id)}>
                <ReturnTo path={returnTo} />
                <ConfirmSubmit variant="secondary" confirm={`Suspend the Atlas contract with ${placeName}? You can resume it later.`}>
                  Suspend
                </ConfirmSubmit>
              </form>
            )}
            {contract.status !== "ended" && (
              <form action={endContractAction.bind(null, contract.id)}>
                <ReturnTo path={returnTo} />
                <ConfirmSubmit confirm={`End the Atlas contract with ${placeName}? An ended contract can't be resumed; a new one would need review.`}>
                  End contract
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </div>
      ))}

      {kind === "business" && !hasOpen && (
        <form action={proposeContractAction.bind(null, placeId)}>
          <ReturnTo path={returnTo} />
          <Button variant="secondary" type="submit">
            {contracts.length === 0 ? "Propose an Atlas contract" : "Propose a new contract"}
          </Button>
        </form>
      )}
    </div>
  );
}
