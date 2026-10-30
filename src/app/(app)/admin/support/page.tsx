import { SUPPORT_REASONS } from "@/db/operations/guest-support";
import { SupportLookupForm } from "./support-lookup-form";

export default function SupportPage() {
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Guest support</h1>
        <p className="text-sm text-slate-600">
          Find one guest by exact email to resolve a support request. You&apos;ll see their stay and plan progress, nothing more.
        </p>
      </div>
      <SupportLookupForm reasons={SUPPORT_REASONS} />
    </div>
  );
}
