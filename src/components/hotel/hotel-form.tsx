import type { Place } from "@/db/schema";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Select } from "@/components/shared/select";

export function HotelForm({
  action,
  places,
  currentPlaceId,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  places: Place[];
  currentPlaceId?: string;
  error?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Select label="Place" name="placeId" defaultValue={currentPlaceId ?? ""} required>
        <option value="" disabled>
          Select a place
        </option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
          </option>
        ))}
      </Select>
      <Button type="submit">{currentPlaceId ? "Save changes" : "Create hotel"}</Button>
    </form>
  );
}
