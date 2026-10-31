import type { Metadata } from "next";
import { HOTEL_STATUSES, TIME_ZONES } from "@/components/admin/fixtures";
import { AdminFormCard, AdminInput, AdminSelect, FormActions, FormRow } from "@/components/admin/form-parts";
import { AdminPageHeader } from "@/components/admin/page-parts";

/* AdminHotelForm · Hotel: create or edit — Figma frame 70:900. */

export const metadata: Metadata = { title: "Admin · Hotel details" };

export default function AdminHotelFormPage() {
  return (
    <>
      <AdminPageHeader form title="Hotel details" description="Create a new hotel or edit an existing one." />
      <AdminFormCard title="Hotel" description="Guests only see what this hotel owns or has approved.">
        <FormRow>
          <AdminInput id="hotel-name" label="Hotel name" defaultValue="Hotel A" />
          <AdminInput id="hotel-city" label="City" defaultValue="Tbilisi" />
        </FormRow>
        <AdminInput id="hotel-address" label="Address" defaultValue="[Street address]" />
        <FormRow>
          <AdminInput id="hotel-latitude" label="Latitude" defaultValue="41.7151" inputMode="decimal" />
          <AdminInput
            id="hotel-longitude"
            label="Longitude"
            defaultValue="44.8271"
            inputMode="decimal"
            hint="Real coordinates are used for routing and check-in distance."
          />
        </FormRow>
        <FormRow>
          <AdminSelect id="hotel-time-zone" label="Time zone" options={TIME_ZONES} defaultValue="Asia/Tbilisi" />
          <AdminInput id="hotel-phone" label="Front desk phone" defaultValue="[Phone number]" inputMode="tel" />
        </FormRow>
        <AdminSelect id="hotel-status" label="Status" options={HOTEL_STATUSES} defaultValue="Active" className="sm:w-[300px]" />
        <FormActions save="Save hotel" to="AdminHotels" />
      </AdminFormCard>
    </>
  );
}
