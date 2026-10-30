import Link from "next/link";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/db/schema";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { requireUser } from "@/lib/authorization";
import { distanceMeters } from "@/lib/geo";
import { listEligibleExperiencesForGuest } from "@/services/eligibility";
import { resolveVisitDuration } from "@/services/advisor/visit-duration";
import { describePriceLevel } from "@/services/advisor/preference-ranking";

/**
 * Everything this guest's own hotel has approved, in one list.
 *
 * The set comes from `listEligibleExperiencesForGuest`, which derives the hotel
 * from the guest's own active stay: the hotel's facilities plus the external Places
 * it has an active, confirmed partnership with. No request parameter widens that —
 * the category filter below only narrows what is already eligible, and a guest with
 * no valid stay sees nothing rather than "everything nearby".
 */
export default async function ExperiencesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const user = await requireUser();

  const selectedCategory = isPlaceCategory(category) ? category : null;

  const [result, preferences] = await Promise.all([
    listEligibleExperiencesForGuest({
      userId: user.id,
      filter: selectedCategory ? { categories: [selectedCategory] } : undefined,
    }),
    findPreferencesForUser(user.id),
  ]);

  if (result.status !== "ok") {
    return (
      <div className="space-y-4">
        <Header />
        <EmptyState
          title="No hotel stay yet"
          description="Scan your hotel's code to start your stay. Atlas then shows what that hotel has approved for its guests."
        />
        <p className="text-sm">
          <Link href="/" className="text-slate-700 underline">
            Go to check in
          </Link>
        </p>
      </div>
    );
  }

  const { experiences, hotelLocation } = result;

  // Categories that actually exist in this hotel's eligible set — offering a filter
  // that can only ever return nothing would be a dead end.
  const availableCategories = [...new Set(experiences.map((entry) => entry.place.category))].sort();
  const interests = new Set(preferences?.categories ?? []);

  return (
    <div className="space-y-4">
      <Header />

      {availableCategories.length > 0 && (
        <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
          <FilterChip href="/experiences" active={selectedCategory === null} label="All" />
          {availableCategories.map((entry) => (
            <FilterChip
              key={entry}
              href={`/experiences?category=${entry}`}
              active={selectedCategory === entry}
              label={entry.replace("_", " ")}
            />
          ))}
        </nav>
      )}

      {experiences.length === 0 ? (
        <EmptyState
          title={selectedCategory ? "Nothing approved in that category" : "Nothing approved yet"}
          description={
            selectedCategory
              ? "Your hotel has no approved experiences in this category. Try another one, or view all."
              : "Your hotel hasn't approved any experiences yet. Atlas only shows places your own hotel has signed off, so this stays empty until it does."
          }
        />
      ) : (
        <ul className="space-y-3">
          {experiences.map(({ place, source, facilityType }) => {
            const duration = resolveVisitDuration(place);
            const metres = distanceMeters(hotelLocation, { lat: place.latitude, lng: place.longitude });

            return (
              <li key={place.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-medium text-slate-900">{place.name}</h2>
                      <p className="text-xs text-slate-500">
                        {place.category}
                        {interests.has(place.category) && " · matches your interests"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {source === "facility" ? `Hotel's own${facilityType ? ` · ${facilityType}` : ""}` : "Hotel partner"}
                    </span>
                  </div>

                  {place.description && <p className="text-sm text-slate-600">{place.description}</p>}

                  <p className="text-xs text-slate-500">
                    {formatDistance(metres)} from your hotel · about {duration.minutes} min to visit
                    {duration.source === "category_estimate" && " (estimated)"}
                    {" · "}
                    {describePriceLevel(place.priceLevel) ? `price level: ${describePriceLevel(place.priceLevel)}` : "price not recorded"}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Approved by your hotel</h1>
      <p className="text-sm text-slate-600">
        Atlas only ever suggests your own hotel&apos;s facilities and the partners it has approved — never whatever
        happens to be nearby.
      </p>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
      }`}
    >
      {label}
    </Link>
  );
}

function isPlaceCategory(value: string | undefined): value is PlaceCategory {
  return value !== undefined && (PLACE_CATEGORIES as readonly string[]).includes(value);
}

function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}
