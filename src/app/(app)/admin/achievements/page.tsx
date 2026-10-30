import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { Select } from "@/components/shared/select";
import { listAchievementsWithUsage } from "@/db/queries/achievements";
import { listPlaces } from "@/db/queries/places";
import { createAchievementAction, deleteAchievementAction } from "@/features/achievements/actions";

/**
 * Badges: one optional collectible per Place, earned by a verified visit.
 *
 * Shows how many guests hold each one, because that number decides what an admin
 * may do next — an earned badge cannot be deleted, since the unlock is a guest's
 * record of something they actually did.
 */
export default async function AdminAchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;

  const [rows, places] = await Promise.all([listAchievementsWithUsage(), listPlaces()]);

  const taken = new Set(rows.map((row) => row.achievement.placeId));
  // A hotel is a route's origin, not a place a guest checks in to earn something.
  const available = places.filter(
    (place) => place.category !== "hotel" && place.archivedAt === null && !taken.has(place.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Achievements</h1>
        <p className="text-sm text-slate-600">
          An optional badge attached to a Place, unlocked the first time a guest checks in there. Badges are
          collectibles — Atlas has no points, levels or leaderboards.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <Card className="space-y-3">
        <h2 className="font-medium">Create a badge</h2>

        {available.length === 0 ? (
          <p className="text-sm text-slate-600">
            Every eligible Place already has a badge, or there are no published, unarchived Places to attach one to.
          </p>
        ) : (
          <form action={createAchievementAction} className="space-y-3">
            <Select label="Place" name="placeId" required>
              {available.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name} ({place.category})
                </option>
              ))}
            </Select>
            <Field label="Name" name="name" required maxLength={120} />
            <Field label="Description" name="description" maxLength={1000} />
            <Field
              label="Badge image URL"
              name="badgeImageUrl"
              type="url"
              maxLength={2000}
              hint="An http(s) link to an image. Atlas renders it in the browser and never fetches it server-side."
            />
            <Button type="submit">Create badge</Button>
          </form>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Existing badges</h2>

        {rows.length === 0 ? (
          <EmptyState title="No badges yet" description="Attach one to a Place above to start a collection." />
        ) : (
          <ul className="space-y-2">
            {rows.map(({ achievement, placeName, placeArchivedAt, unlocks }) => (
              <li key={achievement.id} className="rounded border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{achievement.name}</p>
                    <p className="text-xs text-slate-500">
                      at {placeName}
                      {placeArchivedAt && " (place archived)"} ·{" "}
                      {unlocks === 0 ? "not earned yet" : `earned by ${unlocks} guest${unlocks === 1 ? "" : "s"}`}
                    </p>
                    {achievement.description && (
                      <p className="mt-1 text-sm text-slate-600">{achievement.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/admin/achievements/${achievement.id}`} className="text-sm text-slate-700 underline">
                      Edit
                    </Link>

                    {unlocks === 0 ? (
                      <form action={deleteAchievementAction}>
                        <input type="hidden" name="id" value={achievement.id} />
                        <Button type="submit" variant="secondary">
                          Delete
                        </Button>
                      </form>
                    ) : (
                      // Not merely hidden: the action refuses too, and so does the schema.
                      <span className="text-xs text-slate-500">Earned — can&apos;t be deleted</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
