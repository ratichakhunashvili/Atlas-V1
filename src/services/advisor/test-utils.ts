import type { Place, PlaceCategory } from "@/db/schema";

let counter = 0;

/** Minimal, deterministic Place fixture for tests — never imported outside test files. */
export function makeTestPlace(overrides: Partial<Place> & { category: PlaceCategory }): Place {
  counter += 1;
  return {
    id: overrides.id ?? `place-${counter}`,
    name: overrides.name ?? `Test Place ${counter}`,
    description: overrides.description ?? null,
    latitude: overrides.latitude ?? 0,
    longitude: overrides.longitude ?? 0,
    category: overrides.category,
    address: overrides.address ?? null,
    imageUrl: overrides.imageUrl ?? null,
    website: overrides.website ?? null,
    phone: overrides.phone ?? null,
    qrToken: overrides.qrToken ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}
