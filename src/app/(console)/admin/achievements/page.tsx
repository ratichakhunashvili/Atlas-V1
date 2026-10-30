import type { Metadata } from "next";
import { AdminTable, RowAction } from "@/components/admin/data-table";
import { AdminFlash, AdminHeaderAction, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";
import { listAchievementsWithUsage } from "@/db/queries/achievements";

/*
 * AdminAchievements · Achievements — Figma frame 70:1920, on real data: one optional badge per
 * Place, unlocked the first time a guest's check-in there is verified. Atlas has no points or
 * levels. The unlock count matters to the admin because an earned badge can't be deleted.
 *
 * "New achievement" opens /admin/achievements/new; "Edit" opens the existing badge editor.
 */

export const metadata: Metadata = { title: "Achievements" };
export const dynamic = "force-dynamic";

export default async function AdminAchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const [{ error, ok }, rows] = await Promise.all([searchParams, listAchievementsWithUsage()]);

  return (
    <>
      <AdminPageHeader
        title="Achievements"
        description="Unlocked by a verified check-in at the place. There are no points or rewards."
        action={<AdminHeaderAction href="/admin/achievements/new">New achievement</AdminHeaderAction>}
      />
      <AdminFlash ok={ok} error={error} />
      {rows.length === 0 ? (
        <AdminNote>No achievements yet.</AdminNote>
      ) : (
        <AdminTable
          caption="Achievements"
          columns={[
            { label: "Name", width: 220 },
            { label: "Place", width: 200 },
            { label: "Unlock method", width: 170 },
            { label: "Status", width: 120 },
            { label: "Unlocks", width: 90 },
            { label: "Actions", hidden: true },
          ]}
          rows={rows.map(({ achievement, placeName, placeArchivedAt, unlocks }) => ({
            key: achievement.id,
            cells: [
              achievement.name,
              placeName,
              "Verified check-in",
              <StatusPill key="status" status={placeArchivedAt ? "Archived" : "Active"} />,
              unlocks,
              <RowAction key="edit" href={`/admin/achievements/${achievement.id}`} label={`Edit ${achievement.name}`}>
                Edit
              </RowAction>,
            ],
          }))}
        />
      )}
      <AdminNote>{"Camera view unlock is still a prototype, so it isn't offered here."}</AdminNote>
    </>
  );
}
