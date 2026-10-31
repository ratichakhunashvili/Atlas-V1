import type { Metadata } from "next";
import { PLACE_NAMES, QR_PURPOSES } from "@/components/admin/fixtures";
import { AdminFormCard, AdminInput, AdminSelect, FormActions, FormRow } from "@/components/admin/form-parts";
import { AdminNote, AdminPageHeader } from "@/components/admin/page-parts";

/* AdminQRCreate · Create a code — Figma frame 70:1664. */

export const metadata: Metadata = { title: "Admin · Create a code" };

export default function AdminQrCreatePage() {
  return (
    <>
      <AdminPageHeader form title="Create a code" description="Choose what the code is for. You can print it right after." />
      <AdminFormCard title="Code details">
        <FormRow>
          <AdminSelect
            id="qr-purpose"
            label="Purpose"
            options={QR_PURPOSES}
            defaultValue="Place check-in"
            height={48}
            hint="A code works for one purpose only."
          />
          <AdminSelect id="qr-target" label="Target" options={PLACE_NAMES} defaultValue="Partner Place 2" height={48} />
        </FormRow>
        <FormRow>
          <AdminInput id="qr-label" label="Label" defaultValue="Partner Place 2 counter" height={48} hint="Only admins see this." />
          <AdminInput id="qr-expires" label="Expires on" defaultValue="[date]" height={48} hint="Leave empty for no expiry." />
        </FormRow>
        <AdminNote>The code is shown once after you create it.</AdminNote>
        <FormActions save="Create code" to="AdminQRCreated" cancelTo="AdminQR" />
      </AdminFormCard>
    </>
  );
}
