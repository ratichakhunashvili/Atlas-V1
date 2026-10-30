import type { Metadata } from "next";
import { AdminFormCard, AdminInput, AdminSelect, AdminTextarea, SubmitActions } from "@/components/admin/form-parts";
import { AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
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

export default async function NewAchievementPage() {
  const [places, rows] = await Promise.all([listPlaces(), listAchievementsWithUsage()]);
  const taken = new Set(rows.map((row) => row.achievement.placeId));
  const available = places.filter((place) => place.category !== "hotel" && place.archivedAt === null && !taken.has(place.id));

  return (
    <>
      <AdminPageHeader title="New achievement" description="One badge per place, unlocked by a verified check-in there." />
      {available.length === 0 ? (
        <AdminNote>Every place already has a badge, or there are no unarchived places to attach one to.</AdminNote>
      ) : (
        <AdminFormCard title="Achievement" action={createAchievementAction}>
          <AdminInput id="achievement-name" name="name" label="Name" height={48} required />
          <AdminSelect
            id="achievement-place"
            name="placeId"
            label="Place"
            height={48}
            required
            options={available.map((place) => ({ value: place.id, label: place.name }))}
          />
          <AdminTextarea id="achievement-description" name="description" label="Description" />
          <AdminInput
            id="achievement-badge"
            name="badgeImageUrl"
            label="Badge image URL"
            height={48}
            hint="Optional. An http(s) link to the badge artwork."
          />
          <SubmitActions save="Save achievement" cancelHref="/admin/achievements" />
        </AdminFormCard>
      )}
    </>
  );
}
