import type { Metadata } from "next";
import { SAMPLE_QR_CODE } from "@/components/admin/fixtures";
import { QrCodesView } from "@/components/admin/qr-codes-view";
import { QrRevokeDialog } from "@/components/admin/qr-revoke-dialog";

/* AdminQRRevoke · Revoke a code — Figma frame 70:1796. The QR codes list with a confirmation dialog over it. */

export const metadata: Metadata = { title: "Admin · Revoke a code" };

export default function AdminQrRevokePage() {
  return (
    <>
      <QrCodesView />
      <QrRevokeDialog label={SAMPLE_QR_CODE.label} />
    </>
  );
}
