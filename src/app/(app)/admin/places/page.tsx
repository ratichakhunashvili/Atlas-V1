import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { PlaceTable } from "@/components/places/place-table";
import { buttonStyles } from "@/components/shared/button";
import { listPlaces } from "@/db/queries/places";

export default async function AdminPlacesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const places = await listPlaces();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Places</h1>
        <Link href="/admin/places/new" className={buttonStyles.primary}>
          New place
        </Link>
      </div>
      {error && <Alert>{error}</Alert>}
      <PlaceTable places={places} />
    </div>
  );
}
