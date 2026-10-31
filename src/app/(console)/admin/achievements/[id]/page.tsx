import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { Field } from "@/components/shared/field";
import { countUnlocksForAchievement, findAchievement } from "@/db/queries/achievements";
import { findPlaceById } from "@/db/queries/places";
import { updateAchievementAction } from "@/features/achievements/actions";

/**
 * Editing one badge.
 *
 * Its Place is shown but not editable: an unlock points at a verified visit to
 * that exact Place, so moving the badge elsewhere would quietly rewrite what every
 * guest who earned it actually did. A badge for a different Place is a new badge.
 */
export default async function EditAchievementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const achievement = await findAchievement(id);
  if (!achievement) notFound();

  const [place, unlocks] = await Promise.all([
    findPlaceById(achievement.placeId),
    countUnlocksForAchievement(achievement.id),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/admin/achievements" className="text-sm text-slate-600 underline">
          ← Achievements
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit badge</h1>
        <p className="text-sm text-slate-600">
          At {place?.name ?? "a place that is no longer listed"} ·{" "}
          {unlocks === 0 ? "not earned yet" : `earned by ${unlocks} guest${unlocks === 1 ? "" : "s"}`}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {unlocks > 0 && (
        <Alert variant="success">
          Guests already hold this badge. Editing its name or artwork changes how it appears to them; it never takes
          the badge away.
        </Alert>
      )}

      <Card>
        <form action={updateAchievementAction.bind(null, achievement.id)} className="space-y-3">
          <Field label="Name" name="name" defaultValue={achievement.name} required maxLength={120} />
          <Field
            label="Description"
            name="description"
            defaultValue={achievement.description ?? ""}
            maxLength={1000}
          />
          <Field
            label="Badge image URL"
            name="badgeImageUrl"
            type="url"
            defaultValue={achievement.badgeImageUrl ?? ""}
            maxLength={2000}
            hint="An http(s) link to an image. Atlas renders it in the browser and never fetches it server-side."
          />
          <Button type="submit">Save badge</Button>
        </form>
      </Card>
    </div>
  );
}
