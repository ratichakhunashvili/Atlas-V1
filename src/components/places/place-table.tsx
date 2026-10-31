import Link from "next/link";
import type { Place } from "@/db/schema";
import { archivePlaceAction, deletePlaceAction, unarchivePlaceAction } from "@/features/places/actions";
import { Button } from "@/components/shared/button";
import { EmptyState } from "@/components/shared/empty-state";

export function PlaceTable({ places }: { places: Place[] }) {
  if (places.length === 0) {
    return <EmptyState title="No places yet" description="Create the first place to get started." />;
  }

  return (
    <table className="w-full divide-y divide-slate-200 text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Name</th>
          <th className="py-2">Category</th>
          <th className="py-2">Coordinates</th>
          <th className="py-2">Status</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {places.map((place) => (
          <tr key={place.id}>
            <td className="py-2 font-medium text-slate-900">
              {place.name}
              {place.archivedAt && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">archived</span>}
            </td>
            <td className="py-2 text-slate-600">{place.category}</td>
            <td className="py-2 text-slate-600">
              {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
            </td>
            <td className="py-2 text-slate-600">
              {place.publicationStatus} · {place.verificationStatus}
            </td>
            <td className="space-x-2 py-2 text-right">
              <Link href={`/admin/places/${place.id}`} className="text-slate-700 underline">
                Edit
              </Link>
              <form action={place.archivedAt ? unarchivePlaceAction : archivePlaceAction} className="inline">
                <input type="hidden" name="id" value={place.id} />
                <Button variant="secondary" type="submit">
                  {place.archivedAt ? "Unarchive" : "Archive"}
                </Button>
              </form>
              <form action={deletePlaceAction} className="inline">
                <input type="hidden" name="id" value={place.id} />
                <Button variant="danger" type="submit">
                  Delete
                </Button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
