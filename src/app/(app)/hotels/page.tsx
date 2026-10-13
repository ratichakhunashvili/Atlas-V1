import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { listHotelsWithPlace } from "@/db/queries/hotels";
import { requireUser } from "@/lib/authorization";

export default async function HotelsPage() {
  await requireUser();
  const hotels = await listHotelsWithPlace();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hotels</h1>
      {hotels.length === 0 ? (
        <EmptyState
          title="No hotels yet"
          description="Hotels will appear here once an admin adds them."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {hotels.map((hotel) => (
            <Card key={hotel.id}>
              <p className="font-medium">{hotel.place.name}</p>
              <p className="text-sm text-slate-500">{hotel.place.address ?? "No address on file"}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
