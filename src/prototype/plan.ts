import type { PlaceCategory } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { DEMO_VISIT_MINUTES } from "./fixtures";

/**
 * Prototype guest-plan helpers: interests, free time, and a SIMPLE itinerary
 * preview. Pure functions, no I/O. This is not the production Advisor: there
 * is no routing, distance, or travel-time data here.
 */

export const INTERESTS = [
  { id: "food", label: "Food & drink", categories: ["restaurant"] },
  { id: "wellness", label: "Wellness", categories: ["spa"] },
  { id: "sights", label: "Sights & culture", categories: ["attraction", "landmark", "museum", "historical"] },
  { id: "outdoors", label: "Nature & outdoors", categories: ["nature", "beach", "activity"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; categories: readonly PlaceCategory[] }>;

export type InterestId = (typeof INTERESTS)[number]["id"];

export const FREE_TIME_OPTIONS = [
  { minutes: 60, label: "About 1 hour" },
  { minutes: 120, label: "About 2 hours" },
  { minutes: 180, label: "About 3 hours" },
  { minutes: 240, label: "Half a day (4 hours)" },
] as const;

/** Placeholder only — the prototype has no routing data. */
export const PLACEHOLDER_TRAVEL_MINUTES = 15;

type RawParam = string | string[] | undefined;

function toArray(raw: RawParam): string[] {
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Keeps only known interest ids (in a stable order, no duplicates); anything else in the URL is ignored. */
export function parseInterests(raw: RawParam): InterestId[] {
  const requested = new Set(toArray(raw));
  return INTERESTS.filter((interest) => requested.has(interest.id)).map((interest) => interest.id);
}

/** Only the offered durations are accepted; anything else becomes null. */
export function parseFreeTime(raw: RawParam): number | null {
  const value = toArray(raw)[0];
  if (value === undefined) return null;
  const minutes = Number(value);
  return FREE_TIME_OPTIONS.some((option) => option.minutes === minutes) ? minutes : null;
}

export type PlanSelection = { interests: InterestId[]; freeTimeMinutes: number | null };

export function buildPlanQuery(selection: PlanSelection): string {
  const params = new URLSearchParams();
  for (const interest of selection.interests) params.append("interests", interest);
  if (selection.freeTimeMinutes !== null) params.set("minutes", String(selection.freeTimeMinutes));
  return params.toString();
}

/** Narrows an already-ELIGIBLE list by the guest's interests. It can never add a Place. No interests selected => nothing. */
export function selectExperiences(eligible: readonly EligiblePlace[], interests: readonly InterestId[]): EligiblePlace[] {
  const wanted = new Set<PlaceCategory>();
  for (const interest of INTERESTS) {
    if (interests.includes(interest.id)) for (const category of interest.categories) wanted.add(category);
  }
  return eligible.filter((entry) => wanted.has(entry.place.category));
}

export type ExperienceView = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  kind: "Hotel facility" | "Hotel partner";
  visitMinutes: number;
};

export function toExperienceView(entry: EligiblePlace): ExperienceView {
  return {
    id: entry.place.id,
    name: entry.place.name,
    description: entry.place.description,
    address: entry.place.address,
    kind: entry.source === "facility" ? "Hotel facility" : "Hotel partner",
    visitMinutes: DEMO_VISIT_MINUTES[entry.place.id] ?? 60,
  };
}

export type PreviewStop = { experience: ExperienceView; startMinute: number; endMinute: number };

export type ItineraryPreview = {
  stops: PreviewStop[];
  /** Eligible, wanted experiences that did not fit in the free time — shown, never swapped for anything else. */
  leftOut: ExperienceView[];
  totalMinutes: number;
};

/**
 * A deliberately simple greedy preview: take the eligible experiences in the
 * order given, add each one that still fits in the free time (visit length
 * plus a fixed placeholder travel gap between stops). It never adds a Place
 * that was not passed in, so a preview can have fewer stops — or none.
 */
export function buildItineraryPreview(experiences: readonly ExperienceView[], freeTimeMinutes: number): ItineraryPreview {
  const stops: PreviewStop[] = [];
  const leftOut: ExperienceView[] = [];
  let cursor = 0;

  for (const experience of experiences) {
    const travel = stops.length === 0 ? 0 : PLACEHOLDER_TRAVEL_MINUTES;
    const start = cursor + travel;
    const end = start + experience.visitMinutes;
    if (end <= freeTimeMinutes) {
      stops.push({ experience, startMinute: start, endMinute: end });
      cursor = end;
    } else {
      leftOut.push(experience);
    }
  }

  return { stops, leftOut, totalMinutes: cursor };
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
