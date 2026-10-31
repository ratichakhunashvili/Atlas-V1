import type { Metadata } from "next";
import { AtlasIcon } from "@/components/atlas-ui/asset";
import { SAMPLE_QR_CODE, SAMPLE_QR_LINK } from "@/components/admin/fixtures";
import { AdminHeaderAction, AdminPageHeader } from "@/components/admin/page-parts";
import { QrCodeActions } from "@/components/admin/qr-code-actions";

/* AdminQRCreated · Code created — Figma frame 70:1730. Below 768px the details move under the code. */

export const metadata: Metadata = { title: "Admin · Code created" };

export default function AdminQrCreatedPage() {
  const details = [
    { label: "Purpose", value: SAMPLE_QR_CODE.purpose },
    { label: "Target", value: SAMPLE_QR_CODE.target },
    { label: "Expires", value: SAMPLE_QR_CODE.expires },
    { label: "Link", value: SAMPLE_QR_LINK },
  ];
  return (
    <>
      <AdminPageHeader
        title="Code created"
        description={`${SAMPLE_QR_CODE.label} · ${SAMPLE_QR_CODE.purpose}`}
        action={<AdminHeaderAction to="AdminQR">Done</AdminHeaderAction>}
      />
      <section
        aria-label="New code"
        className="flex w-full flex-col items-start gap-[24px] rounded-[14px] border border-atlas-beige bg-white p-[16px] sm:p-[28px] md:flex-row md:gap-[32px]"
      >
        <div className="flex size-[220px] shrink-0 items-center justify-center self-center rounded-[12px] border border-atlas-beige bg-white md:self-start">
          {/* A placeholder graphic from the design, not a scannable code. */}
          <AtlasIcon src="/atlas-ui/admin-qr-sample.svg" size={170} alt="QR code (sample graphic)" />
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-[12px]">
          <div className="flex w-full items-start gap-[8px] rounded-[12px] bg-atlas-sand px-[14px] py-[12px]">
            <AtlasIcon src="/atlas-ui/icon-warn-teal-18.svg" size={18} className="mt-[1px] shrink-0" />
            <p className="min-w-0 flex-1 font-manrope text-[14px] font-semibold leading-[1.45] text-atlas-ink">
              This is the only time this code is shown. Download or print it now.
            </p>
          </div>
          <dl className="flex w-full flex-col gap-[12px]">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="flex w-full flex-wrap items-start justify-between gap-x-[16px] border-b border-atlas-beige py-[6px]"
              >
                <dt className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{detail.label}</dt>
                <dd className="min-w-0 text-right font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink [overflow-wrap:anywhere]">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
          <QrCodeActions link={SAMPLE_QR_LINK} />
        </div>
      </section>
    </>
  );
}
