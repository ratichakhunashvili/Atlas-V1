import type { Metadata } from "next";
import { QrCodesView } from "@/components/admin/qr-codes-view";

/* AdminQR · QR codes — Figma frame 70:1549. */

export const metadata: Metadata = { title: "Admin · QR codes" };

export default function AdminQrPage() {
  return <QrCodesView />;
}
