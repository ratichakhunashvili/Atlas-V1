import type { Metadata } from "next";
import { FACILITY_TYPES, HOTEL_NAMES, PUBLISH_STATUSES } from "@/components/admin/fixtures";
import { AdminFormCard, AdminInput, AdminSelect, AdminTextarea, FormActions, FormRow } from "@/components/admin/form-parts";
import { AdminPageHeader } from "@/components/admin/page-parts";

/* AdminFacilityForm · Facility: create or edit — Figma frame 70:1471. */

export const metadata: Metadata = { title: "Admin · Facility details" };

export default function AdminFacilityFormPage() {
  return (
    <>
      <AdminPageHeader form title="Facility details" description="Create a new facility or edit an existing one." />
      <AdminFormCard title="Facility">
        <FormRow>
          <AdminSelect id="facility-hotel" label="Hotel" options={HOTEL_NAMES} defaultValue="Hotel A" height={48} />
          <AdminSelect id="facility-type" label="Type" options={FACILITY_TYPES} defaultValue="Spa" height={48} />
        </FormRow>
        <AdminInput id="facility-name" label="Name" defaultValue="Spa" height={48} />
        <AdminTextarea id="facility-description" label="Description" defaultValue="[What the facility offers, from the hotel]" />
        <FormRow>
          <AdminInput id="facility-location" label="Where in the hotel" defaultValue="Floor 2" height={48} />
          <AdminInput id="facility-visit" label="Typical visit (minutes)" defaultValue="90" inputMode="numeric" height={48} />
        </FormRow>
        <FormRow>
          <AdminInput id="facility-hours" label="Opening hours" defaultValue="[Hours]" height={48} />
          <AdminSelect id="facility-status" label="Status" options={PUBLISH_STATUSES} defaultValue="Published" height={48} />
        </FormRow>
        <FormActions save="Save facility" to="AdminFacilities" />
      </AdminFormCard>
    </>
  );
}
