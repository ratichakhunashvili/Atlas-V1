import { and, desc, eq, gt, isNotNull, sql, type SQL } from "drizzle-orm";
import { hotels, itineraryDays, itineraryStops, places, planDayFeedback, users } from "@/db/schema";
import { FEEDBACK_SEGMENTS, type FeedbackAnswers, type FeedbackSegment } from "@/features/feedback/segments";
import { dayNeedsFeedback, type FeedbackCandidate, type TodayPlanDay } from "@/services/feedback/needs-feedback";
import type { AtlasDatabase } from "./types";

/*
 * Private feedback on a finished plan day (Phase 2). Takes the database handle so the PGlite tests run this exact SQL;
 * db/queries/plan-day-feedback.ts binds it to the production handle. The rule of which days are owed lives in
 * services/feedback/needs-feedback.ts; this only gathers the facts and stores the answers.
 */

export type DayNeedingFeedback = FeedbackCandidate & {
  hotelId: string;
  hotelName: string;
  startedAt: Date;
  isToday: boolean;
};

/**
 * The user's own days that could still be owed feedback: set-aside days, days with feedback, and days from before
 * feedback shipped (feedback_requested false, migration 0036) are left out.
 */
export async function listFeedbackCandidates(db: AtlasDatabase, userId: string): Promise<Omit<DayNeedingFeedback, "isToday">[]> {
  const rows = await db
    .select({
      dayId: itineraryDays.id,
      dayNumber: itineraryDays.dayNumber,
      hotelId: itineraryDays.hotelId,
      hotelName: places.name,
      startedAt: itineraryDays.generatedAt,
      visitedStops: sql<number>`(select count(*)::int from ${itineraryStops} where ${itineraryStops.dayId} = ${itineraryDays.id} and ${itineraryStops.visitedAt} is not null)`,
    })
    .from(itineraryDays)
    .innerJoin(hotels, eq(hotels.id, itineraryDays.hotelId))
    .innerJoin(places, eq(places.id, hotels.placeId))
    .where(
      and(
        eq(itineraryDays.userId, userId),
        eq(itineraryDays.feedbackRequested, true),
        gt(itineraryDays.dayNumber, 0),
        sql`not exists (select 1 from ${planDayFeedback} where ${planDayFeedback.itineraryDayId} = ${itineraryDays.id})`
      )
    )
    .orderBy(desc(itineraryDays.generatedAt));
  return rows.map((row) => ({ ...row, visitedStops: Number(row.visitedStops), hasFeedback: false }));
}

/** The user's days that are owed feedback now: today's (when finished) first, then the newest earlier day. */
export async function listDaysNeedingFeedback(db: AtlasDatabase, userId: string, today: TodayPlanDay): Promise<DayNeedingFeedback[]> {
  return selectDaysNeedingFeedback(await listFeedbackCandidates(db, userId), today);
}

/** Applies the rule (services/feedback/needs-feedback.ts) to candidates already read, in the order the guest sees them. */
export function selectDaysNeedingFeedback(candidates: readonly Omit<DayNeedingFeedback, "isToday">[], today: TodayPlanDay): DayNeedingFeedback[] {
  return candidates
    .filter((day) => dayNeedsFeedback(day, today))
    .map((day) => ({ ...day, isToday: day.dayId === today.dayId }))
    .sort((a, b) => Number(b.isToday) - Number(a.isToday) || b.startedAt.getTime() - a.startedAt.getTime());
}

export type SubmitFeedbackResult = { ok: true } | { ok: false; reason: "already_done" | "not_needed" };

function columnsFor(answers: FeedbackAnswers) {
  return {
    overallRating: answers.overall.rating,
    overallNote: answers.overall.note,
    technicalRating: answers.technical.rating,
    technicalNote: answers.technical.note,
    mapRating: answers.map.rating,
    mapNote: answers.map.note,
    placesRating: answers.places.rating,
    placesNote: answers.places.note,
    checkinRating: answers.checkin.rating,
    checkinNote: answers.checkin.note,
    moneyRating: answers.money.rating,
    moneyNote: answers.money.note,
    hotelRating: answers.hotel.rating,
    hotelNote: answers.hotel.note,
  };
}

/**
 * Stores the guest's feedback for one of their own days. The day id came from a form, so it is a claim: the day must
 * belong to this user and be owed feedback right now. A second submit for the same day (double tap, second tab) is
 * "already_done", never an error. The hotel is taken from the day row, never from the form.
 */
export async function submitPlanDayFeedback(
  db: AtlasDatabase,
  input: { userId: string; dayId: string; today: TodayPlanDay; answers: FeedbackAnswers; now: Date }
): Promise<SubmitFeedbackResult> {
  return db.transaction(async (tx) => {
    const [day] = await tx
      .select({ id: itineraryDays.id, hotelId: itineraryDays.hotelId })
      .from(itineraryDays)
      .where(and(eq(itineraryDays.id, input.dayId), eq(itineraryDays.userId, input.userId)))
      .limit(1);
    // Someone else's day, or no such day: the same answer, so a guess reveals nothing.
    if (!day) return { ok: false, reason: "not_needed" };

    const [existing] = await tx.select({ id: planDayFeedback.id }).from(planDayFeedback).where(eq(planDayFeedback.itineraryDayId, day.id)).limit(1);
    if (existing) return { ok: false, reason: "already_done" };

    const owed = await listDaysNeedingFeedback(tx, input.userId, input.today);
    if (!owed.some((entry) => entry.dayId === day.id)) return { ok: false, reason: "not_needed" };

    // A request that raced this one past the checks above loses here, quietly (no failed statement in the transaction).
    const inserted = await tx
      .insert(planDayFeedback)
      .values({ userId: input.userId, itineraryDayId: day.id, hotelId: day.hotelId, createdAt: input.now, ...columnsFor(input.answers) })
      .onConflictDoNothing({ target: planDayFeedback.itineraryDayId })
      .returning({ id: planDayFeedback.id });
    return inserted.length > 0 ? { ok: true } : { ok: false, reason: "already_done" };
  });
}

/* ---------- Admin: read-only list with filters and averages ---------- */

const NOTE_COLUMNS = {
  overall: planDayFeedback.overallNote,
  technical: planDayFeedback.technicalNote,
  map: planDayFeedback.mapNote,
  places: planDayFeedback.placesNote,
  checkin: planDayFeedback.checkinNote,
  money: planDayFeedback.moneyNote,
  hotel: planDayFeedback.hotelNote,
} as const satisfies Record<FeedbackSegment, unknown>;

const RATING_COLUMNS = {
  overall: planDayFeedback.overallRating,
  technical: planDayFeedback.technicalRating,
  map: planDayFeedback.mapRating,
  places: planDayFeedback.placesRating,
  checkin: planDayFeedback.checkinRating,
  money: planDayFeedback.moneyRating,
  hotel: planDayFeedback.hotelRating,
} as const satisfies Record<FeedbackSegment, unknown>;

export type AdminFeedbackFilter = { hotelId?: string; noteFor?: FeedbackSegment };

export type AdminFeedbackEntry = {
  id: string;
  createdAt: Date;
  hotelName: string;
  guestEmail: string;
  dayStartedAt: Date;
  dayNumber: number;
  segments: Record<FeedbackSegment, { rating: number | null; note: string | null }>;
};

export type AdminFeedbackPage = {
  entries: AdminFeedbackEntry[];
  total: number;
  /** Average rating per segment for the whole filter (not only this page); null when nobody rated it. */
  averages: Record<FeedbackSegment, number | null>;
  /** How many entries rated each segment (the rest said "didn't use it"). */
  ratedCounts: Record<FeedbackSegment, number>;
};

function whereFor(filter: AdminFeedbackFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.hotelId) conditions.push(eq(planDayFeedback.hotelId, filter.hotelId));
  // A note of only spaces is never stored (validation trims to null), so "not null" means there is something to read.
  if (filter.noteFor) conditions.push(isNotNull(NOTE_COLUMNS[filter.noteFor]));
  return conditions.length ? and(...conditions) : undefined;
}

/** Newest first, with hotel, guest email and day. Admin only: the caller checks requireAdmin(). */
export async function listFeedbackForAdmin(
  db: AtlasDatabase,
  input: AdminFeedbackFilter & { page: number; pageSize: number }
): Promise<AdminFeedbackPage> {
  const where = whereFor(input);
  const pageSize = Math.min(Math.max(Math.trunc(input.pageSize), 1), 100);
  const page = Math.max(Math.trunc(input.page), 1);

  // One aggregate row over the same filter as the list: AVG and COUNT(column) skip NULL ("didn't use it").
  const summarySelection: Record<string, SQL> = { total: sql`count(*)::int` };
  for (const segment of FEEDBACK_SEGMENTS) {
    summarySelection[`${segment}Avg`] = sql`avg(${RATING_COLUMNS[segment]})::float8`;
    summarySelection[`${segment}Rated`] = sql`count(${RATING_COLUMNS[segment]})::int`;
  }

  const [[summary], rows] = await Promise.all([
    db.select(summarySelection).from(planDayFeedback).where(where),
    db
      .select({
        feedback: planDayFeedback,
        hotelName: places.name,
        guestEmail: users.email,
        dayStartedAt: itineraryDays.generatedAt,
        dayNumber: itineraryDays.dayNumber,
      })
      .from(planDayFeedback)
      .innerJoin(users, eq(users.id, planDayFeedback.userId))
      .innerJoin(itineraryDays, eq(itineraryDays.id, planDayFeedback.itineraryDayId))
      .innerJoin(hotels, eq(hotels.id, planDayFeedback.hotelId))
      .innerJoin(places, eq(places.id, hotels.placeId))
      .where(where)
      .orderBy(desc(planDayFeedback.createdAt), desc(planDayFeedback.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const stats = (summary ?? {}) as Record<string, unknown>;
  const averages = Object.fromEntries(
    FEEDBACK_SEGMENTS.map((segment) => {
      const value = stats[`${segment}Avg`];
      return [segment, value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100];
    })
  ) as Record<FeedbackSegment, number | null>;
  const ratedCounts = Object.fromEntries(FEEDBACK_SEGMENTS.map((segment) => [segment, Number(stats[`${segment}Rated`] ?? 0)])) as Record<
    FeedbackSegment,
    number
  >;

  return {
    total: Number(stats.total ?? 0),
    averages,
    ratedCounts,
    entries: rows.map((row) => ({
      id: row.feedback.id,
      createdAt: row.feedback.createdAt,
      hotelName: row.hotelName,
      guestEmail: row.guestEmail,
      dayStartedAt: row.dayStartedAt,
      dayNumber: row.dayNumber,
      segments: {
        overall: { rating: row.feedback.overallRating, note: row.feedback.overallNote },
        technical: { rating: row.feedback.technicalRating, note: row.feedback.technicalNote },
        map: { rating: row.feedback.mapRating, note: row.feedback.mapNote },
        places: { rating: row.feedback.placesRating, note: row.feedback.placesNote },
        checkin: { rating: row.feedback.checkinRating, note: row.feedback.checkinNote },
        money: { rating: row.feedback.moneyRating, note: row.feedback.moneyNote },
        hotel: { rating: row.feedback.hotelRating, note: row.feedback.hotelNote },
      },
    })),
  };
}
