import type { Metadata } from "next";
import { ACHIEVEMENT_PLACES, PUBLISH_STATUSES, UNLOCK_METHODS } from "@/components/admin/fixtures";
import { AdminFormCard, AdminInput, AdminSelect, AdminTextarea, FormActions, FormRow } from "@/components/admin/form-parts";
import { AdminPageHeader } from "@/components/admin/page-parts";

/* AdminAchievementForm · Achievement: create or edit — Figma frame 70:2027. */

export const metadata: Metadata = { title: "Admin · Achievement details" };

export default function AdminAchievementFormPage() {
  return (
    <>
      <AdminPageHeader form title="Achievement details" description="Create a new achievement or edit an existing one." />
      <AdminFormCard title="Achievement">
        <FormRow>
          <AdminInput id="achievement-name" label="Name" defaultValue="[Achievement 3]" height={48} />
          <AdminSelect id="achievement-place" label="Place" options={ACHIEVEMENT_PLACES} defaultValue="Partner Place 2" height={48} />
        </FormRow>
        <AdminTextarea id="achievement-description" label="Description" defaultValue="[What the guest did to earn it]" />
        <FormRow>
          <AdminSelect
            id="achievement-unlock"
            label="Unlock method"
            options={UNLOCK_METHODS}
            defaultValue="Scan place code"
            height={48}
            hint="Checked on the server. A tap alone never unlocks an achievement."
          />
          <AdminSelect id="achievement-status" label="Status" options={PUBLISH_STATUSES} defaultValue="Published" height={48} />
        </FormRow>
        <FormActions save="Save achievement" to="AdminAchievements" />
      </AdminFormCard>
    </>
  );
}
