import { PlaceForm } from "@/components/places/place-form";
import { createPlaceAction } from "@/features/places/actions";

export default async function NewPlacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">New place</h1>
      <PlaceForm action={createPlaceAction} error={error} />
    </div>
  );
}
