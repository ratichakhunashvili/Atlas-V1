import { SUPPORT_REASONS } from "@/db/operations/guest-support";
import { listHotelsWithPlace } from "@/db/queries/hotels";
import { requireAdmin } from "@/lib/authorization";
import { SupportLookupForm } from "./support-lookup-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Guest support" };

export default async function SupportPage() {
  await requireAdmin();
  // Only hotels a guest could actually be based at; the server re-checks on every move.
  const hotels = (await listHotelsWithPlace())
    .filter(({ place }) => place.publicationStatus === "published" && place.verificationStatus === "verified" && place.archivedAt === null)
    .map(({ id, place }) => ({ id, name: place.name }));
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Guest support</h1>
        <p className="text-sm text-slate-600">
          Find one guest by exact email to resolve a support request. You&apos;ll see their stay and plan progress, nothing more, and can move them to another hotel.
        </p>
      </div>
      <SupportLookupForm reasons={SUPPORT_REASONS} hotels={hotels} />
    </div>
  );
}
