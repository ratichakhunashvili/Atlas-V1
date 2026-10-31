import Link from "next/link";
import { Card } from "@/components/shared/card";
import { buttonStyles } from "@/components/shared/button";
import { DEMO_HOTEL_A, DEMO_HOTEL_B } from "@/prototype/fixtures";
import { StepHeader } from "./_components/step-header";

/** Step 1: the hotel QR landing screen. Real QR scanning is not part of this prototype — each "QR" is just a demo link. */
export default function DemoLandingPage() {
  return (
    <div className="space-y-6">
      <StepHeader
        step={1}
        title="Welcome to Atlas"
        subtitle="Tell us when you’re free. We’ll figure out what you can do."
      />

      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Scan the QR code at your hotel</h2>
          <p className="mt-1 text-sm text-slate-600">
            At a real hotel this is a QR code at the front desk. In this prototype, pick a demo QR link below to see
            the guest flow for that hotel.
          </p>
        </div>

        <ul className="space-y-3">
          {[DEMO_HOTEL_A, DEMO_HOTEL_B].map((hotel) => (
            <li key={hotel.id} className="rounded-lg border border-slate-200 p-4">
              <p className="font-medium">{hotel.name}</p>
              <p className="text-sm text-slate-500">{hotel.tagline}</p>
              <p className="mt-2 break-all font-mono text-xs text-slate-500">/demo/{hotel.demoQrToken}</p>
              <Link href={`/demo/${hotel.demoQrToken}`} className={`${buttonStyles.primary} mt-3 w-full`}>
                Open {hotel.name} demo QR link
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
