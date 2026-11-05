import Link from "next/link";
import { PlaceForm } from "@/components/places/place-form";
import { Alert } from "@/components/shared/alert";
import { adminListDuplicateCandidates } from "@/db/queries/places";
import { createPlaceAction } from "@/features/places/actions";
import { placePrefill } from "@/features/places/prefill";
import { findLikelyDuplicates, type DuplicateMatch } from "@/services/catalog/duplicates";

type SearchParams = Record<string, string | undefined>;

const REASON_LABEL: Record<DuplicateMatch["reasons"][number], string> = {
  same_name: "same name",
  similar_name: "very similar name",
  nearby: "very close by",
};

export const metadata = { title: "New place" };

/**
 * The create page. After a duplicate warning the admin lands back here with their values pre-filled (carried in
 * the query string — catalog data, nothing personal) and the likely matches listed. The warning is recomputed on the
 * server from those values on every load, so it can never be stale; "Create anyway" is a deliberate second submit.
 */
export default async function NewPlacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const prefill = placePrefill(params);

  const warned = params.duplicates === "1" && prefill.name && prefill.latitude !== undefined && prefill.longitude !== undefined;
  const matches = warned
    ? findLikelyDuplicates(
        { name: prefill.name!, latitude: prefill.latitude!, longitude: prefill.longitude! },
        await adminListDuplicateCandidates({ name: prefill.name!, latitude: prefill.latitude!, longitude: prefill.longitude! })
      )
    : [];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/admin/places" className="atlas-hit inline-block text-sm text-slate-600 underline">
          ← Places
        </Link>
        <h1 className="mt-2 text-xl font-semibold">New place</h1>
      </div>

      {matches.length > 0 && (
        <section aria-labelledby="duplicates-title" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 id="duplicates-title" className="text-sm font-semibold text-amber-900">
            This may already exist
          </h2>
          <p className="text-xs text-amber-800">
            Atlas keeps one record per real place, so please check these first. Nothing is merged or deleted for you; if
            this really is a different place, use <strong>Create anyway</strong> below.
          </p>
          <ul className="space-y-2">
            {matches.slice(0, 8).map(({ place, reasons, distanceMeters }) => (
              <li key={place.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <Link href={`/admin/places/${place.id}`} className="font-medium text-slate-900 underline">
                    {place.name}
                  </Link>{" "}
                  <span className="text-xs text-slate-600">
                    {place.category}
                    {place.archived && " · archived"} · {reasons.map((reason) => REASON_LABEL[reason]).join(", ")} ·{" "}
                    {Math.round(distanceMeters)} m away
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {params.error && <Alert>{params.error}</Alert>}
      <PlaceForm action={createPlaceAction} place={prefill} confirmCreateAnyway={matches.length > 0} />
    </div>
  );
}
