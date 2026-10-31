import type { Metadata } from "next";
import { HOTEL_NAMES, PARTNERSHIP_STATUSES, PLACE_NAMES } from "@/components/admin/fixtures";
import { AdminFormCard, AdminInput, AdminSelect, AdminTextarea, FormActions, FormRow } from "@/components/admin/form-parts";
import { AdminPageHeader } from "@/components/admin/page-parts";

/* AdminPartnershipForm · Partnership: link or edit — Figma frame 70:1311. */

export const metadata: Metadata = { title: "Admin · Link a place to a hotel" };

export default function AdminPartnershipFormPage() {
  return (
    <>
      <AdminPageHeader
        form
        title="Link a place to a hotel"
        description="Applies to the selected hotel only. Another hotel needs its own partnership."
      />
      <AdminFormCard title="Partnership">
        <FormRow>
          <AdminSelect id="partnership-hotel" label="Hotel" options={HOTEL_NAMES} defaultValue="Hotel A" height={48} />
          <AdminSelect id="partnership-place" label="Place" options={PLACE_NAMES} defaultValue="Partner Place 3" height={48} />
        </FormRow>
        <AdminSelect
          id="partnership-status"
          label="Status"
          options={PARTNERSHIP_STATUSES}
          defaultValue="Revoked"
          height={48}
          className="sm:w-[300px]"
          hint={"Revoked and expired partnerships stop showing the place to that hotel's guests. Past plans keep their history."}
        />
        <FormRow>
          <AdminInput id="partnership-starts" label="Starts" defaultValue="[start date]" height={48} />
          <AdminInput id="partnership-ends" label="Ends" defaultValue="[end date]" height={48} hint="Leave empty for no end date." />
        </FormRow>
        <AdminTextarea id="partnership-notes" label="Internal notes" defaultValue="[Visible to admins only]" />
        <FormActions save="Save partnership" to="AdminPartnerships" />
      </AdminFormCard>
    </>
  );
}
