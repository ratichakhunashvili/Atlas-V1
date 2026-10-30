import type { Metadata } from "next";
import { AdminTable, RowAction } from "@/components/admin/data-table";
import { ADMIN_ACHIEVEMENTS } from "@/components/admin/fixtures";
import { AdminHeaderAction, AdminNote, AdminPageHeader, SampleDataNote } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";

/* AdminAchievements · Achievements — Figma frame 70:1920. */

export const metadata: Metadata = { title: "Admin · Achievements" };

export default function AdminAchievementsPage() {
  return (
    <>
      <AdminPageHeader
        title="Achievements"
        description="Unlocked by a verified check-in at the place. There are no points or rewards."
        action={<AdminHeaderAction to="AdminAchievementForm">New achievement</AdminHeaderAction>}
      />
      <AdminTable
        caption="Achievements"
        columns={[
          { label: "Name", width: 220 },
          { label: "Place", width: 180 },
          { label: "Unlock method", width: 170 },
          { label: "Status", width: 110 },
          { label: "Unlocks", width: 90 },
          { label: "Actions", hidden: true },
        ]}
        rows={ADMIN_ACHIEVEMENTS.map((achievement) => ({
          key: achievement.name,
          cells: [
            achievement.name,
            achievement.place,
            achievement.unlockMethod,
            <StatusPill key="status" status={achievement.status} />,
            achievement.unlocks,
            <RowAction key="edit" to="AdminAchievementForm" label={`Edit ${achievement.name}`}>
              Edit
            </RowAction>,
          ],
        }))}
      />
      <AdminNote>{"Camera view unlock is still a prototype, so it isn't offered here."}</AdminNote>
      <SampleDataNote />
    </>
  );
}
