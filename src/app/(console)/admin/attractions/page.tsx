import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonStyles } from "@/components/shared/button";
import type { Metadata } from "next";
import { listExperiencePlacesForAdmin } from "@/db/queries/places";

/**
 * The experiences catalog: every Place a guest might visit, with the state that
 * decides whether any guest can actually see it.
 *
 * A VIEW over the canonical Place model, not a second entity. "Attraction" is a
 * role a Place plays, so this is the Places table filtered to non-hotels and
 * annotated with its relationships — editing still happens on the Place itself,
 * which remains the one record.
 *
 * The point of the screen is the gap it makes visible. A Place can be published,
 * verified and perfectly correct and still reach nobody, because no hotel has
 * approved it; from the Place's own form that is invisible. Here it reads as
 * "reaches no guests", which is the thing an admin needs to know.
 */
export const metadata: Metadata = { title: "Guest reach" };

function sentence(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default async function AdminAttractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rows = await listExperiencePlacesForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Guest reach</h1>
          <p className="text-sm text-slate-600">
            Which places can reach a guest today: a place is seen only by guests of a hotel that owns it as an active
            facility or has an active partnership with it, and only while it is published, verified and not archived.
          </p>
        </div>
        <Link href="/admin/places/new" className={buttonStyles.primary}>
          New place
        </Link>
      </div>

      {error && <Alert>{error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState
          title="No experiences yet"
          description="Create a place, publish and verify it, then add it to a hotel as a partner or a facility."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ place, partnerships, facilities }) => {
            return (
              <li key={place.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-medium text-slate-900">{place.name}</h2>
                      <p className="text-xs text-slate-500">
                        {sentence(place.category)}
                        {place.visitDurationMinutes ? ` · about ${place.visitDurationMinutes} min` : " · visit time estimated"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Badge tone={place.publicationStatus === "published" ? "good" : "muted"}>
                        {sentence(place.publicationStatus)}
                      </Badge>
                      <Badge tone={place.verificationStatus === "verified" ? "good" : "muted"}>
                        {sentence(place.verificationStatus)}
                      </Badge>
                      {place.archivedAt && <Badge tone="muted">Archived</Badge>}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600">
                    {partnerships > 0 && `Active partner of ${partnerships} hotel${partnerships === 1 ? "" : "s"}`}
                    {partnerships > 0 && facilities > 0 && " · "}
                    {facilities > 0 && `Active facility of ${facilities} hotel${facilities === 1 ? "" : "s"}`}
                    {partnerships + facilities === 0 && (
                      <span className="text-amber-700">No active partnership or facility, so no guest can see it.</span>
                    )}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/places/${place.id}`} className="atlas-hit inline-block text-sm text-slate-700 underline">
                      Edit, archive or delete
                    </Link>

                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs ${
        tone === "good" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
      }`}
    >
      {children}
    </span>
  );
}
