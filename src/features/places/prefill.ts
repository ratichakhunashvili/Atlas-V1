import { PLACE_CATEGORIES, PUBLICATION_STATUSES, VERIFICATION_STATUSES, type Place } from "@/db/schema";

/**
 * The place form's fields. After a refused save the action sends the admin's typed values back in the
 * query string (catalogue data, nothing personal), and the page reads them with `placePrefill`.
 */
export const PLACE_FORM_FIELDS = [
  "name",
  "description",
  "latitude",
  "longitude",
  "category",
  "address",
  "imageUrl",
  "website",
  "phone",
  "visitDurationMinutes",
  "priceLevel",
  "priceLevelSource",
  "publicationStatus",
  "verificationStatus",
] as const;

type SearchParams = Record<string, string | undefined>;

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function number(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** True when the query carries a returned form (the name is always there after a refused save). */
export function hasReturnedPlaceForm(params: SearchParams): boolean {
  return params.name !== undefined;
}

export function placePrefill(params: SearchParams): Partial<Place> {
  return {
    name: params.name,
    description: params.description ?? null,
    latitude: number(params.latitude),
    longitude: number(params.longitude),
    category: oneOf(params.category, PLACE_CATEGORIES),
    address: params.address ?? null,
    imageUrl: params.imageUrl ?? null,
    website: params.website ?? null,
    phone: params.phone ?? null,
    visitDurationMinutes: number(params.visitDurationMinutes) ?? null,
    priceLevel: number(params.priceLevel) ?? null,
    priceLevelSource: params.priceLevelSource ?? null,
    publicationStatus: oneOf(params.publicationStatus, PUBLICATION_STATUSES),
    verificationStatus: oneOf(params.verificationStatus, VERIFICATION_STATUSES),
  };
}

/** The typed values, for the redirect back to the form. Empty values are left out. */
export function placeFormQuery(formData: FormData, extra: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  for (const key of PLACE_FORM_FIELDS) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  return params.toString();
}
