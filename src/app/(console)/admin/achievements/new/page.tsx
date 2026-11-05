import type { Metadata } from "next";
import { AdminFormCard, AdminInput, AdminSelect, AdminTextarea, SubmitActions } from "@/components/admin/form-parts";
import { AdminFlash, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { listAchievementsWithUsage } from "@/db/queries/achievements";
import { listPlaces } from "@/db/queries/places";
import { createAchievementAction } from "@/features/achievements/actions";

/*
 * Create an achievement, in the AdminAchievementForm layout (Figma 70:2027), saving through
 * createAchievementAction. The action re-checks everything (admin, the Place exists, isn't a hotel
 * and has no badge yet), so the list of places offered here is only a convenience.
 */

export const metadata: Metadata = { title: "New achievement" };
export const dynamic = "force-dynamic";

type SearchParams = { error?: string; placeId?: string; name?: string; description?: string; badgeImageUrl?: string };

export default async function NewAchievementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // After a refused save the action sends the typed values back.
  const [typed, places, rows] = await Promise.all([searchParams, listPlaces(), listAchievementsWithUsage()]);
  const taken = new Set(rows.map((row) => row.achievement.placeId));
  const available = places.filter((place) => place.category !== "hotel" && place.kind !== "hotel" && place.archivedAt === null && !taken.has(place.id));

  return (
    <>
      <AdminPageHeader title="New achievement" description="One achievement per place, unlocked by a verified check-in there." />
      <AdminFlash error={typed.error} />
      {available.length === 0 ? (
        <AdminNote>Every place already has an achievement, or there are no unarchived places to attach one to.</AdminNote>
      ) : (
        <AdminFormCard title="Achievement" action={createAchievementAction}>
          <AdminInput id="achievement-name" name="name" label="Name" height={48} required defaultValue={typed.name} />
          <AdminSelect
            id="achievement-place"
            name="placeId"
            label="Place"
            height={48}
            required
            defaultValue={typed.placeId}
            options={available.map((place) => ({ value: place.id, label: place.name }))}
          />
          <AdminTextarea id="achievement-description" name="description" label="Description" defaultValue={typed.description} />
          <AdminInput
            id="achievement-badge"
            name="badgeImageUrl"
            label="Badge image URL"
            height={48}
            hint="Optional. An http(s) link to the badge artwork."
            defaultValue={typed.badgeImageUrl}
          />
          <SubmitActions save="Save achievement" cancelHref="/admin/achievements" />
        </AdminFormCard>
      )}
    </>
  );
}
