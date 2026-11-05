import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/shared/alert";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { Select } from "@/components/shared/select";
import { listPartnershipsForAdmin } from "@/db/queries/hotel-partnerships";
import { findHotelById } from "@/db/queries/hotels";
import { listPlaces } from "@/db/queries/places";
import {
  addPartnershipAction,
  confirmPartnershipAction,
  reopenPartnershipAction,
  revokePartnershipAction,
  suspendPartnershipAction,
  updatePartnershipPromotionAction,
} from "@/features/partnerships/actions";
import { uuidOrNotFound } from "@/lib/route-ids";

/** Prefills the confirm form with the row's saved value so a blank field is a deliberate "clear", never an accidental wipe (e.g. of a migrated legacy priority or a saved end date). */
function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "—";
}

const STATUS_LABEL = { pending_review: "Pending review", active: "Active", suspended: "Suspended", revoked: "Revoked" } as const;

/** "active" in the database can still be outside its window; show what guests actually get. */
function effectiveLabel(status: keyof typeof STATUS_LABEL, startsAt: Date | null, endsAt: Date | null, now: Date) {
  if (status !== "active") return STATUS_LABEL[status];
  if (endsAt && endsAt.getTime() <= now.getTime()) return "Active (expired)";
  if (startsAt && startsAt.getTime() > now.getTime()) return "Active (scheduled)";
  return "Active";
}

export const metadata = { title: "Hotel partnerships" };

export default async function HotelPartnershipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const id = uuidOrNotFound((await params).id);
  const { error, ok } = await searchParams;
  const hotel = await findHotelById(id);
  if (!hotel) notFound();

  const [rows, places] = await Promise.all([listPartnershipsForAdmin(hotel.id), listPlaces()]);
  const existingPlaceIds = new Set(rows.map((row) => row.place.id));
  const proposable = places.filter(
    // Another hotel is never a partner (the server refuses it too); facilities are managed on their own page.
    (place) => place.archivedAt === null && place.kind !== "hotel" && !existingPlaceIds.has(place.id)
  );
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/hotels/${hotel.id}`} className="atlas-hit inline-block text-sm text-slate-600 underline">
          ← {hotel.place.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Hotel partnerships — {hotel.place.name}</h1>
        <p className="text-sm text-slate-500">
          Only partners you confirm here (active, inside their dates) are shown to this hotel&apos;s guests. A partnership with
          another hotel never carries over. The hotel&apos;s own facilities are managed on their own page.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <Card className="space-y-3">
        <h2 className="font-medium">Propose a partner</h2>
        <p className="text-xs text-slate-500">Hotels are not listed: a hotel can&apos;t be another hotel&apos;s partner.</p>
        <form action={addPartnershipAction.bind(null, hotel.id)} className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-auto sm:min-w-[16rem] sm:flex-1">
            <Select label="Place" name="placeId" defaultValue="" required>
              <option value="" disabled>
                Select a place…
              </option>
              {proposable.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name} ({place.category.replaceAll("_", " ")})
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Add as pending review</Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No partners yet" description="Propose a place above, then confirm it to make it visible to guests." />
      ) : (
        <div className="space-y-4">
          {rows.map(({ partnership, place }) => (
            <Card key={partnership.id} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-slate-900">
                  {place.name}
                  {place.archivedAt && <span className="ml-2 text-xs font-normal text-slate-500">(place archived)</span>}
                </p>
                <p className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {effectiveLabel(partnership.status, partnership.startsAt, partnership.endsAt, now)}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Starts {formatDate(partnership.startsAt)} · Ends {formatDate(partnership.endsAt)} · Priority{" "}
                {partnership.priority ?? "—"} · Confirmed {formatDate(partnership.confirmedAt)}
              </p>

              {(partnership.status === "active" || partnership.status === "pending_review") && (
              <>
              <form
                action={updatePartnershipPromotionAction.bind(null, partnership.id)}
                className="flex flex-wrap items-end gap-3 rounded border border-slate-200 p-3"
              >
                <label className="flex h-10 items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" name="featured" defaultChecked={partnership.featured} className="size-4" />
                  Featured for this hotel
                </label>
                <div className="w-full sm:w-auto sm:min-w-[16rem] sm:flex-1">
                  <Field
                    label="Offer for guests (optional, max 120 characters)"
                    name="offerText"
                    id={`offer-${partnership.id}`}
                    maxLength={120}
                    defaultValue={partnership.offerText ?? ""}
                    placeholder="e.g. 10% off for hotel guests"
                  />
                </div>
                <Button variant="secondary" type="submit">
                  Save featured &amp; offer
                </Button>
              </form>
              <p className="text-xs text-slate-500">
                A featured partner always takes one of a guest&apos;s three options when it fits their time and interests, and is
                shown larger with a &quot;Featured&quot; label. It only applies while the partnership is active.
              </p>
              </>
              )}

              {(partnership.status === "pending_review" || partnership.status === "suspended") && (
                <form action={confirmPartnershipAction.bind(null, partnership.id)} className="flex flex-wrap items-end gap-2">
                  <Field label="Starts (UTC date, optional)" name="startsAt" id={`startsAt-${partnership.id}`} type="date" defaultValue={dateInputValue(partnership.startsAt)} />
                  <Field label="Ends (UTC date, optional)" name="endsAt" id={`endsAt-${partnership.id}`} type="date" defaultValue={dateInputValue(partnership.endsAt)} />
                  <Field label="Priority (optional)" name="priority" id={`priority-${partnership.id}`} type="number" min={1} max={1000} defaultValue={partnership.priority ?? ""} />
                  <Button type="submit">{partnership.status === "suspended" ? "Resume partnership" : "Confirm partnership"}</Button>
                </form>
              )}

              <div className="flex flex-wrap gap-2">
                {partnership.status === "active" && (
                  <form action={suspendPartnershipAction.bind(null, partnership.id)}>
                    <ConfirmSubmit variant="secondary" confirm={`Suspend the partnership with ${place.name}? This hotel's guests stop seeing it until you resume it.`}>
                      Suspend
                    </ConfirmSubmit>
                  </form>
                )}
                {partnership.status !== "revoked" && (
                  <form action={revokePartnershipAction.bind(null, partnership.id)}>
                    <ConfirmSubmit confirm={`Revoke the partnership with ${place.name}? It can only come back as a new pending review.`}>
                      Revoke
                    </ConfirmSubmit>
                  </form>
                )}
                {partnership.status === "revoked" && (
                  <form action={reopenPartnershipAction.bind(null, partnership.id)}>
                    <Button variant="secondary" type="submit">
                      Re-open as pending review
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
