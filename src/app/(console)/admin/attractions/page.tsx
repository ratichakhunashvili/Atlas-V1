import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonStyles } from "@/components/shared/button";
import { listExperiencePlacesForAdmin } from "@/db/queries/places";
import { archivePlaceAction, unarchivePlaceAction } from "@/features/places/actions";

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
          <h1 className="text-xl font-semibold">Attractions</h1>
          <p className="text-sm text-slate-600">
            Places guests can visit. Each is one canonical Place — the same record a hotel approves as a partner or
            owns as a facility.
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
          description="Create a Place, publish and verify it, then approve it from a hotel as a partner or a facility."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ place, partnerships, facilities }) => {
            const reachable = !place.archivedAt && partnerships + facilities > 0;

            return (
              <li key={place.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-medium text-slate-900">{place.name}</h2>
                      <p className="text-xs text-slate-500">
                        {place.category}
                        {place.visitDurationMinutes ? ` · about ${place.visitDurationMinutes} min` : " · visit time estimated"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Badge tone={place.publicationStatus === "published" ? "good" : "muted"}>
                        {place.publicationStatus}
                      </Badge>
                      <Badge tone={place.verificationStatus === "verified" ? "good" : "muted"}>
                        {place.verificationStatus}
                      </Badge>
                      {place.archivedAt && <Badge tone="muted">archived</Badge>}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600">
                    {partnerships > 0 && `Approved by ${partnerships} hotel${partnerships === 1 ? "" : "s"}`}
                    {partnerships > 0 && facilities > 0 && " · "}
                    {facilities > 0 && `Owned as a facility by ${facilities} hotel${facilities === 1 ? "" : "s"}`}
                    {partnerships + facilities === 0 && (
                      <span className="text-amber-700">
                        No hotel has approved this yet, so no guest can see it.
                      </span>
                    )}
                  </p>

                  {!reachable && !place.archivedAt && partnerships + facilities > 0 && (
                    <p className="text-xs text-slate-500">Archived Places are never shown to guests.</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/places/${place.id}`} className="text-sm text-slate-700 underline">
                      Edit
                    </Link>

                    {/*
                      Archive rather than delete: a Place with partnership or visit
                      history cannot be deleted (the database refuses), and archiving
                      is what makes it invisible to guests while keeping that history.
                    */}
                    <form action={place.archivedAt ? unarchivePlaceAction : archivePlaceAction}>
                      <input type="hidden" name="id" value={place.id} />
                      <Button type="submit" variant="secondary">
                        {place.archivedAt ? "Unarchive" : "Archive"}
                      </Button>
                    </form>
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
