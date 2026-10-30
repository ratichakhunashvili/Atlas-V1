import { PLACE_CATEGORIES, PUBLICATION_STATUSES, VERIFICATION_STATUSES, type Place } from "@/db/schema";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Field } from "@/components/shared/field";
import { Select } from "@/components/shared/select";

export function PlaceForm({
  action,
  place,
  error,
  confirmCreateAnyway = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** The saved Place, or (on the create page) the values to pre-fill after a duplicate warning. */
  place?: Partial<Place>;
  error?: string;
  /** Set once the admin has seen the duplicate warning: the submit then deliberately creates anyway. */
  confirmCreateAnyway?: boolean;
}) {
  return (
    <form action={action} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {confirmCreateAnyway && <input type="hidden" name="confirmCreateAnyway" value="1" />}
      <Field label="Name" name="name" defaultValue={place?.name} required />

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Description</span>
        <textarea
          name="description"
          defaultValue={place?.description ?? ""}
          rows={3}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Latitude"
          name="latitude"
          type="number"
          step="any"
          defaultValue={place?.latitude}
          required
        />
        <Field
          label="Longitude"
          name="longitude"
          type="number"
          step="any"
          defaultValue={place?.longitude}
          required
        />
      </div>

      <Select label="Category" name="category" defaultValue={place?.category ?? PLACE_CATEGORIES[0]}>
        {PLACE_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </Select>

      <Field label="Address" name="address" defaultValue={place?.address ?? ""} />
      <Field label="Image URL" name="imageUrl" defaultValue={place?.imageUrl ?? ""} />
      <Field label="Website" name="website" defaultValue={place?.website ?? ""} />
      <Field label="Phone" name="phone" defaultValue={place?.phone ?? ""} />
      <Field
        label="Typical visit (minutes)"
        name="visitDurationMinutes"
        type="number"
        min={1}
        max={1440}
        defaultValue={place?.visitDurationMinutes ?? ""}
        hint="Leave blank to use the category estimate. The Advisor budgets this time into the guest's day."
      />

      <Select
        label="Price level"
        name="priceLevel"
        defaultValue={place?.priceLevel ?? ""}
      >
        <option value="">Unknown</option>
        <option value="1">1 · budget</option>
        <option value="2">2 · moderate</option>
        <option value="3">3 · luxury</option>
      </Select>
      <p className="-mt-3 text-xs text-slate-500">
        Optional. Unknown stays unknown: guests are never told an unpriced place is affordable.
      </p>
      <Field
        label="Where the price level comes from"
        name="priceLevelSource"
        defaultValue={place?.priceLevelSource ?? ""}
        hint="Required when a price level is set (for example, the venue's own menu, checked today). Confirmed at save time."
      />

      <div className="grid grid-cols-2 gap-4">
        <Select label="Publication" name="publicationStatus" defaultValue={place?.publicationStatus ?? "draft"}>
          {PUBLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
        <Select label="Verification" name="verificationStatus" defaultValue={place?.verificationStatus ?? "unverified"}>
          {VERIFICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-slate-500">
        A place is only ever shown to guests when it is published, verified, not archived, and linked to their hotel as a facility or an
        active partner.
      </p>

      <Button type="submit">{confirmCreateAnyway ? "Create anyway" : place?.id ? "Save changes" : "Create place"}</Button>
    </form>
  );
}
