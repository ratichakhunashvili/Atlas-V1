/*
 * The prototype's planning model: one pure, deterministic function set that every plan screen
 * reads from, so times, stop counts, availability and achievements can never disagree.
 *
 * DEMO ONLY. This is not the Atlas planner. It works on the Figma file's fictional fixtures and
 * a frozen demo clock, inside this browser. In the product, eligibility (which places a hotel
 * has approved), availability and planning are decided on the server for the guest's own hotel;
 * nothing here may be reused as that logic.
 *
 * The file has no runtime imports so `node --test` can load it directly (tests/plan-model.test.mjs).
 */

export type StopId = "partner-1" | "partner-2" | "partner-3" | "partner-4" | "attraction-1" | "pool" | "spa";
export type AchievementId = "achievement-1" | "achievement-2" | "achievement-3" | "achievement-4" | "achievement-5";

export const INTERESTS = ["Food", "Culture", "Nature", "Wellness", "History", "Art", "Nightlife", "Shopping"] as const;
export type Interest = (typeof INTERESTS)[number];

export const TIME_OPTIONS = ["1 h", "2 h", "3 h", "4 h+"] as const;
export type TimeOption = (typeof TIME_OPTIONS)[number];

export const PRICE_OPTIONS = ["Any", "Budget", "Moderate", "Luxury"] as const;
export type PriceOption = (typeof PRICE_OPTIONS)[number];

export type Preferences = { time: TimeOption; interests: Interest[]; price: PriceOption };

/** The design's defaults: "2 h free · Food, Culture · Moderate". */
export const DEFAULT_PREFERENCES: Preferences = { time: "2 h", interests: ["Food", "Culture"], price: "Moderate" };

export type StopKind = "partner" | "facility" | "attraction";

export type StopFixture = {
  id: StopId;
  name: string;
  /** "the pool" — how a sentence refers to it. */
  phrase: string;
  kind: StopKind;
  category: Interest;
  price?: "Budget" | "Moderate";
  /** Typical visit, minutes (the design's "60 min"). */
  visit: number;
  /** Still offered to Hotel A guests. Partner Place 3's partnership has ended in the demo story. */
  available: boolean;
  achievement?: AchievementId;
};

export const STOPS: Record<StopId, StopFixture> = {
  "partner-1": { id: "partner-1", name: "Partner Place 1", phrase: "Partner Place 1", kind: "partner", category: "Food", price: "Moderate", visit: 45, available: true, achievement: "achievement-1" },
  "partner-2": { id: "partner-2", name: "Partner Place 2", phrase: "Partner Place 2", kind: "partner", category: "Culture", price: "Budget", visit: 60, available: true, achievement: "achievement-3" },
  "partner-3": { id: "partner-3", name: "Partner Place 3", phrase: "Partner Place 3", kind: "partner", category: "Food", visit: 40, available: false },
  "partner-4": { id: "partner-4", name: "Partner Place 4", phrase: "Partner Place 4", kind: "partner", category: "Culture", visit: 60, available: true, achievement: "achievement-5" },
  "attraction-1": { id: "attraction-1", name: "Attraction 1", phrase: "Attraction 1", kind: "attraction", category: "History", visit: 45, available: true, achievement: "achievement-4" },
  pool: { id: "pool", name: "Pool", phrase: "the pool", kind: "facility", category: "Wellness", visit: 60, available: true },
  spa: { id: "spa", name: "Spa", phrase: "the spa", kind: "facility", category: "Wellness", visit: 90, available: true, achievement: "achievement-2" },
};

/** Order the planner considers places in when walks tie. */
export const STOP_ORDER: readonly StopId[] = ["partner-2", "partner-4", "attraction-1", "pool", "spa", "partner-1", "partner-3"];

/*
 * Walking minutes between places. Hotel facilities are inside Hotel A, so reaching one means
 * walking back to the hotel. Values reproduce the design where it is consistent: 6 min to
 * Partner Place 1 (arrive 16:06), "11 min walk" from there to Partner Place 2, "9 min from
 * stop 2" to Partner Place 4, and back at Hotel A around 18:10.
 */
type Node = "hotel" | Exclude<StopId, "pool" | "spa">;
const WALKS: Record<string, number> = {
  "hotel|partner-1": 6,
  "hotel|partner-2": 8,
  "hotel|partner-3": 9,
  "hotel|partner-4": 14,
  "hotel|attraction-1": 20,
  "partner-1|partner-2": 11,
  "partner-1|partner-3": 9,
  "partner-1|partner-4": 12,
  "partner-1|attraction-1": 15,
  "partner-2|partner-3": 9,
  "partner-2|partner-4": 9,
  "partner-2|attraction-1": 12,
  "partner-3|partner-4": 8,
  "partner-3|attraction-1": 12,
  "partner-4|attraction-1": 10,
};

function node(id: StopId | "hotel"): Node {
  return id === "pool" || id === "spa" ? "hotel" : id;
}

export function walkMinutes(from: StopId | "hotel", to: StopId | "hotel"): number {
  const a = node(from);
  const b = node(to);
  if (a === b) return 0;
  return WALKS[`${a}|${b}`] ?? WALKS[`${b}|${a}`] ?? 15;
}

/** The guest left Hotel A at 16:00. */
export const DAY_START = 16 * 60;
/** The demo clock is frozen at 16:35 — the design's "1 h 25 min left" of a 2 h afternoon. */
export const DEMO_NOW = 16 * 60 + 35;
/**
 * Free time is approximate. A plan may end up to 15 minutes after the chosen time before Atlas
 * says it runs over — which keeps the design's own "back by 18:10" for a 2 h afternoon valid.
 */
export const RETURN_TOLERANCE = 15;
/** Minutes between arriving and checking in, as in the design (arrive 16:06, checked in 16:12). */
const CHECK_IN_AFTER_ARRIVAL = 6;

export function hoursOf(time: TimeOption): number {
  return time === "4 h+" ? 4 : Number.parseInt(time, 10);
}

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function duration(minutes: number): string {
  const m = Math.max(0, minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export type CompletedStop = { id: StopId; at: number };

export type PlanState = {
  /** False before any plan exists (My plan, empty). */
  planned: boolean;
  /** Checked-in stops, in order. Their times are history and never change. */
  completed: CompletedStop[];
  /** Stops still to visit, in order — unavailable ones included until they are fixed. */
  upcoming: StopId[];
};

export type TimedStop = {
  id: StopId;
  status: "done" | "next" | "later" | "unavailable";
  /** 1-based position in today's plan ("Stop 2 today"). */
  position: number;
  arrive?: number;
  depart?: number;
  checkedInAt?: number;
  /** Walk from the previous stop, minutes. */
  walk?: number;
};

export type PlanTiming = {
  stops: TimedStop[];
  next?: TimedStop;
  returnAt: number;
  windowEnd: number;
  /** Minutes of free time left at the demo clock. */
  left: number;
  overrun: boolean;
  doneCount: number;
  totalCount: number;
};

/** Times every stop from 16:00, skipping stops that can no longer be visited. */
export function timePlan(plan: PlanState, time: TimeOption): PlanTiming {
  const stops: TimedStop[] = [];
  let at: StopId | "hotel" = "hotel";
  let clockAt = DAY_START;
  let position = 0;
  let latestCheckIn = DEMO_NOW;

  for (const done of plan.completed) {
    const walk = walkMinutes(at, done.id);
    const arrive = clockAt + walk;
    const depart = arrive + STOPS[done.id].visit;
    stops.push({ id: done.id, status: "done", position: ++position, arrive, depart, checkedInAt: done.at, walk });
    latestCheckIn = Math.max(latestCheckIn, done.at);
    at = done.id;
    clockAt = depart;
  }

  let next: TimedStop | undefined;
  for (const id of plan.upcoming) {
    if (!STOPS[id].available) {
      stops.push({ id, status: "unavailable", position: ++position });
      continue;
    }
    const walk = walkMinutes(at, id);
    const arrive = clockAt + walk;
    const depart = arrive + STOPS[id].visit;
    const stop: TimedStop = { id, status: next ? "later" : "next", position: ++position, arrive, depart, walk };
    if (!next) next = stop;
    stops.push(stop);
    at = id;
    clockAt = depart;
  }

  const returnAt = clockAt + walkMinutes(at, "hotel");
  const windowEnd = DAY_START + hoursOf(time) * 60;
  return {
    stops,
    next,
    returnAt,
    windowEnd,
    left: Math.max(0, windowEnd - latestCheckIn),
    overrun: returnAt > windowEnd + RETURN_TOLERANCE,
    doneCount: plan.completed.length,
    totalCount: plan.completed.length + plan.upcoming.length,
  };
}

/** When a stop would be checked in if the guest arrived on time. */
export function checkInTime(plan: PlanState, time: TimeOption, id: StopId): number {
  const stop = timePlan(plan, time).stops.find((s) => s.id === id);
  return (stop?.arrive ?? DEMO_NOW) + CHECK_IN_AFTER_ARRIVAL;
}

function priceAllowed(stop: StopFixture, price: PriceOption): boolean {
  if (!stop.price || price === "Any" || price === "Luxury") return true;
  if (price === "Budget") return stop.price === "Budget";
  return true; // Moderate: Budget and Moderate places.
}

/** Places that match the guest's choices and can still be visited. */
export function matchingStops(prefs: Preferences, exclude: readonly StopId[] = []): StopId[] {
  return STOP_ORDER.filter((id) => {
    const stop = STOPS[id];
    return stop.available && !exclude.includes(id) && prefs.interests.includes(stop.category) && priceAllowed(stop, prefs.price);
  });
}

export type PlanProposal =
  | { kind: "plan"; stops: StopId[]; matched: number }
  | { kind: "no-match" }
  | { kind: "no-time"; matched: number };

/**
 * A plan for the rest of the free time: greedily adds the matching place with the shortest walk
 * that still gets the guest back in time. Completed stops are kept as they are.
 */
export function proposePlan(prefs: Preferences, completed: CompletedStop[]): PlanProposal {
  const done = completed.map((c) => c.id);
  const candidates = matchingStops(prefs, done);
  if (candidates.length === 0) return { kind: "no-match" };

  const chosen: StopId[] = [];
  for (;;) {
    const current: PlanState = { planned: true, completed, upcoming: chosen };
    const last = chosen.at(-1) ?? done.at(-1) ?? "hotel";
    const options = candidates
      .filter((id) => !chosen.includes(id))
      .filter((id) => !timePlan({ ...current, upcoming: [...chosen, id] }, prefs.time).overrun)
      .sort((a, b) => walkMinutes(last, a) - walkMinutes(last, b));
    if (options.length === 0) break;
    chosen.push(options[0]);
  }

  if (chosen.length === 0) return { kind: "no-time", matched: candidates.length };
  return { kind: "plan", stops: chosen, matched: candidates.length };
}

/** The best replacement for an unavailable stop: a matching place not already in the plan. */
export function suggestReplacement(plan: PlanState, prefs: Preferences, time: TimeOption): StopId | undefined {
  const inPlan = [...plan.completed.map((c) => c.id), ...plan.upcoming];
  const options = matchingStops(prefs, inPlan);
  const broken = plan.upcoming.find((id) => !STOPS[id].available);
  if (!broken) return undefined;
  const swap = (id: StopId): PlanState => ({ ...plan, upcoming: plan.upcoming.map((u) => (u === broken ? id : u)) });
  const fitting = options.filter((id) => !timePlan(swap(id), time).overrun);
  return fitting[0] ?? options[0];
}

/** Achievements unlocked in this demo: the spa's from yesterday plus every checked-in stop's. */
export function unlockedAchievements(plan: PlanState): AchievementId[] {
  const fromStops = plan.completed.map((c) => STOPS[c.id].achievement).filter((a): a is AchievementId => Boolean(a));
  return ["achievement-2", ...fromStops.filter((a) => a !== "achievement-2")];
}

/** The plan as the design draws it: Partner Place 1 done, Partner Place 2 next, Partner Place 3 unavailable. */
export const DEFAULT_PLAN: PlanState = {
  planned: true,
  completed: [{ id: "partner-1", at: 16 * 60 + 12 }],
  upcoming: ["partner-2", "partner-3"],
};
