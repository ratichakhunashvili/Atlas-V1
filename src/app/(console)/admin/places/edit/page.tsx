import type { Metadata } from "next";
import { AdminSwitch } from "@/components/admin/admin-switch";
import { PLACE_CATEGORIES, PRICE_LEVELS, PUBLISH_STATUSES } from "@/components/admin/fixtures";
import { AdminFormCard, AdminInput, AdminSelect, AdminTextarea, FormActions, FormRow } from "@/components/admin/form-parts";
import { AdminPageHeader } from "@/components/admin/page-parts";

/* AdminPlaceForm · Place: create or edit — Figma frame 70:1100. The one form the design draws without a section title. */

export const metadata: Metadata = { title: "Admin · Place details" };

export default function AdminPlaceFormPage() {
  return (
    <>
      <AdminPageHeader form title="Place details" description="Create a new place or edit an existing one." />
      <AdminFormCard>
        <FormRow>
          <AdminInput id="place-name" label="Name" defaultValue="Partner Place 2" />
          <AdminSelect id="place-category" label="Category" options={PLACE_CATEGORIES} defaultValue="Museum" />
        </FormRow>
        <AdminTextarea id="place-description" label="Description" defaultValue="[What guests will do and where it happens]" minHeight={64} />
        <FormRow>
          <AdminInput id="place-address" label="Address" defaultValue="[Street address]" />
          <AdminInput id="place-visit" label="Typical visit (minutes)" defaultValue="60" inputMode="numeric" />
        </FormRow>
        <FormRow>
          <AdminInput id="place-latitude" label="Latitude" defaultValue="41.7160" inputMode="decimal" />
          <AdminInput id="place-longitude" label="Longitude" defaultValue="44.8300" inputMode="decimal" />
        </FormRow>
        <FormRow>
          <AdminSelect
            id="place-price"
            label="Price level"
            options={PRICE_LEVELS}
            defaultValue="Budget"
            hint="Set only with evidence, such as a menu or price list. Leave empty if unknown."
          />
          <AdminInput id="place-hours" label="Opening hours" defaultValue="[Hours]" />
        </FormRow>
        <div className="flex w-full flex-wrap items-center gap-x-[16px] gap-y-[12px]">
          <AdminSwitch labelledBy="place-verified-label" />
          <p id="place-verified-label" className="min-w-[160px] flex-1 font-manrope text-[14px] leading-[19px] text-atlas-ink">
            Verified by the Atlas team
          </p>
          <AdminSelect
            id="place-status"
            label="Status"
            options={PUBLISH_STATUSES}
            defaultValue="Published"
            className="sm:w-[200px]"
          />
        </div>
        <FormActions save="Save place" to="AdminPlaces" />
      </AdminFormCard>
    </>
  );
}
