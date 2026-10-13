import { notFound } from "next/navigation";
import { PlaceForm } from "@/components/places/place-form";
import { findPlaceById } from "@/db/queries/places";
import { updatePlaceAction } from "@/features/places/actions";

export default async function EditPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const place = await findPlaceById(id);

  if (!place) {
    notFound();
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Edit place</h1>
      <PlaceForm action={updatePlaceAction.bind(null, place.id)} place={place} error={error} />
    </div>
  );
}
