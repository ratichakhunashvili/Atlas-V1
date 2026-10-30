import Link from "next/link";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { listAchievementUnlocksForUser, listPlaceVisitsForUser } from "@/db/queries/place-visits";
import { findPlaceById } from "@/db/queries/places";
import { requireUser } from "@/lib/authorization";

/**
 * Where a guest's own history lives: the badges they have earned and the places
 * they have actually been.
 *
 * Everything on this page is read with the authenticated user's own id, resolved
 * server-side. There is no user parameter to tamper with, so there is no way to
 * ask for somebody else's collection.
 *
 * It reads permanent visits, never itinerary stops — so nothing here can reveal a
 * stop the guest has not reached yet, and a repaired or superseded plan leaves
 * this page untouched. A place visited on a stay that ended months ago still
 * counts, because that is what "I have been there" means.
 */
export default async function CollectionPage() {
  const user = await requireUser();

  const [unlocks, visits] = await Promise.all([
    listAchievementUnlocksForUser(user.id),
    listPlaceVisitsForUser(user.id),
  ]);

  // The Places behind the visits, for their names. Archived ones are included on
  // purpose: the guest was there, whatever the Place's status is now.
  const visitedPlaces = await Promise.all(
    visits.map(async (visit) => ({ visit, place: await findPlaceById(visit.placeId) }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your collection</h1>
        <p className="text-sm text-slate-600">
          Badges you&apos;ve earned and places you&apos;ve been. Yours permanently — they stay here after your stay
          ends.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Badges</h2>

        {unlocks.length === 0 ? (
          <EmptyState
            title="No badges yet"
            description="Some places award a badge the first time you check in there. Check in on your route to start collecting."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unlocks.map(({ unlock, achievement }) => (
              <li key={unlock.id}>
                <Card className="flex items-start gap-3">
                  {achievement.badgeImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={achievement.badgeImageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg"
                    >
                      ★
                    </span>
                  )}
                  <div>
                    <h3 className="font-medium text-slate-900">{achievement.name}</h3>
                    {achievement.description && (
                      <p className="text-sm text-slate-600">{achievement.description}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      Earned {unlock.unlockedAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Places you&apos;ve visited</h2>

        {visitedPlaces.length === 0 ? (
          <EmptyState
            title="Nothing visited yet"
            description="Check in at a stop on your route and it will appear here."
          />
        ) : (
          <ul className="space-y-2">
            {visitedPlaces.map(({ visit, place }) => (
              <li key={visit.id}>
                <Card className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    {/* A deleted Place would leave the visit without a name; it is still a visit. */}
                    <h3 className="font-medium text-slate-900">{place?.name ?? "A place that is no longer listed"}</h3>
                    <p className="text-xs text-slate-500">
                      First visited {visit.firstVisitedAt.toISOString().slice(0, 10)}
                      {visit.visitCount > 1 && ` · ${visit.visitCount} visits`}
                    </p>
                  </div>
                  {place && !place.archivedAt && (
                    <Link href="/experiences" className="text-sm text-slate-700 underline">
                      See what else your hotel offers
                    </Link>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
