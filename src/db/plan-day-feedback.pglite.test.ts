import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import type { Hotel, ItineraryDay, Place } from "@/db/schema";
import { FEEDBACK_SEGMENTS, type FeedbackAnswers } from "@/features/feedback/segments";
import { startDayForUser, type DailyPlanDependencies } from "@/services/advisor/daily-plan";
import { makeTestPlace } from "@/services/advisor/test-utils";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { NO_TODAY } from "@/services/feedback/needs-feedback";
import { deleteGuestAccount } from "./operations/account-deletion";
import { listDaysNeedingFeedback, listFeedbackCandidates, listFeedbackForAdmin, submitPlanDayFeedback } from "./operations/plan-day-feedback";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";

/*
 * Phase 2, private feedback after a plan day, against the real migrations: the table's constraints, which days are
 * owed feedback, the start-plan gate, the submit rules and the admin list.
 */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

const NOW = new Date("2026-11-12T12:00:00Z");
let counter = 0;

async function seedHotel(label: string) {
  const { db, schema } = database;
  const [place] = await db.insert(schema.places).values({ name: `Hotel ${label}`, latitude: 41.7, longitude: 44.8, category: "hotel", kind: "hotel" }).returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  return { hotel, place };
}

async function seedGuest(label: string, hotelLabel = label) {
  const { db, schema } = database;
  counter += 1;
  const [user] = await db.insert(schema.users).values({ email: `${label}-${counter}@example.test`, passwordHash: "x" }).returning();
  const { hotel, place } = await seedHotel(`${hotelLabel}-${counter}`);
  const [stay] = await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-11-10T08:00:00Z") }).returning();
  return { user, hotel, hotelPlace: place, stay };
}

async function seedDay(
  guest: Awaited<ReturnType<typeof seedGuest>>,
  input: { dayNumber: number; visited: number; pending?: number; generatedAt?: Date; feedbackRequested?: boolean }
): Promise<ItineraryDay> {
  const { db, schema } = database;
  const [day] = await db
    .insert(schema.itineraryDays)
    .values({
      userId: guest.user.id,
      hotelId: guest.hotel.id,
      hotelStayId: guest.stay.id,
      dayNumber: input.dayNumber,
      stopCount: input.visited + (input.pending ?? 0),
      availableMinutes: 120,
      generatedAt: input.generatedAt ?? new Date(`2026-11-${String(9 + Math.max(1, input.dayNumber)).padStart(2, "0")}T09:00:00Z`),
      ...(input.feedbackRequested === undefined ? {} : { feedbackRequested: input.feedbackRequested }),
    })
    .returning();
  for (let i = 0; i < input.visited + (input.pending ?? 0); i += 1) {
    await db.insert(schema.itineraryStops).values({
      dayId: day.id,
      checkInMethod: "qr_or_gps",
      name: `Stop ${i}`,
      latitude: 41.7,
      longitude: 44.8,
      position: i,
      visitedAt: i < input.visited ? new Date(day.generatedAt.getTime() + 3_600_000) : null,
    });
  }
  return day;
}

function answers(overrides: Partial<FeedbackAnswers> = {}): FeedbackAnswers {
  const base = Object.fromEntries(FEEDBACK_SEGMENTS.map((segment) => [segment, { rating: null, note: null }])) as unknown as FeedbackAnswers;
  return { ...base, overall: { rating: 4, note: null }, ...overrides };
}

function rawRow(guest: Awaited<ReturnType<typeof seedGuest>>, day: ItineraryDay, values: Record<string, unknown> = {}) {
  return { userId: guest.user.id, itineraryDayId: day.id, hotelId: guest.hotel.id, overallRating: 3, ...values };
}

describe("plan_day_feedback: the database holds the rules", () => {
  it("accepts ratings 1 to 5 and NULL (didn't use it) for every segment but Overall", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("valid");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    await db.insert(schema.planDayFeedback).values(rawRow(guest, day, { overallRating: 5, technicalRating: 1, mapRating: null, hotelNote: "x".repeat(1000) }));
    const [row] = await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.itineraryDayId, day.id));
    assert.equal(row.overallRating, 5);
    assert.equal(row.mapRating, null);
  });

  it("refuses ratings outside 1 to 5 in any segment", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("range");
    for (const [column, value] of [
      ["overallRating", 0],
      ["overallRating", 6],
      ["technicalRating", 0],
      ["mapRating", 6],
      ["placesRating", -1],
      ["checkinRating", 7],
      ["moneyRating", 0],
      ["hotelRating", 6],
    ] as const) {
      const day = await seedDay(guest, { dayNumber: 1 + counter++, visited: 1 });
      assert.equal(await expectSqlFailure(() => db.insert(schema.planDayFeedback).values(rawRow(guest, day, { [column]: value }))), "23514", `${column}=${value}`);
    }
  });

  it("requires the overall rating", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("overall");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    assert.equal(await expectSqlFailure(() => db.insert(schema.planDayFeedback).values(rawRow(guest, day, { overallRating: null }))), "23502");
  });

  it("refuses a note longer than 1000 characters", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("note");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    for (const column of ["overallNote", "technicalNote", "mapNote", "placesNote", "checkinNote", "moneyNote", "hotelNote"]) {
      assert.equal(await expectSqlFailure(() => db.insert(schema.planDayFeedback).values(rawRow(guest, day, { [column]: "x".repeat(1001) }))), "23514", column);
    }
  });

  it("allows one feedback per day", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("once");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    await db.insert(schema.planDayFeedback).values(rawRow(guest, day));
    assert.equal(await expectSqlFailure(() => db.insert(schema.planDayFeedback).values(rawRow(guest, day, { overallRating: 1 }))), "23505");
  });

  it("is deleted with its day, and with the account", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("cascade");
    const dayOne = await seedDay(guest, { dayNumber: 1, visited: 1 });
    const dayTwo = await seedDay(guest, { dayNumber: 2, visited: 1 });
    await db.insert(schema.planDayFeedback).values([rawRow(guest, dayOne), rawRow(guest, dayTwo)]);

    await db.delete(schema.itineraryDays).where(eq(schema.itineraryDays.id, dayOne.id));
    assert.equal((await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.itineraryDayId, dayOne.id))).length, 0);

    assert.deepEqual(await deleteGuestAccount(db, guest.user.id), { ok: true });
    assert.equal((await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.userId, guest.user.id))).length, 0);
  });
});

describe("migration 0036 on a database that already has days", () => {
  it("marks every existing day as not asking for feedback, and every later day as asking", async () => {
    // Replays the migration's two itinerary_days statements on a database whose days predate them, as on Neon.
    const scratch = await createTestDatabase();
    try {
      const { db, schema } = scratch;
      const [place] = await db.insert(schema.places).values({ name: "Hotel M", latitude: 41.7, longitude: 44.8, category: "hotel", kind: "hotel" }).returning();
      const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
      const [user] = await db.insert(schema.users).values({ email: "migration@example.test", passwordHash: "x" }).returning();
      await db.execute(sql.raw(`ALTER TABLE "itinerary_days" DROP COLUMN "feedback_requested"`));
      await db.execute(sql`INSERT INTO "itinerary_days" (user_id, hotel_id, day_number, stop_count) VALUES (${user.id}, ${hotel.id}, 1, 0)`);

      const migration = readFileSync("src/db/migrations/0036_plan_day_feedback.sql", "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
        .filter((statement) => statement.includes("feedback_requested"));
      assert.equal(migration.length, 2, "add the column as false, then make true the default");
      for (const statement of migration) await db.execute(sql.raw(statement));

      await db.execute(sql`INSERT INTO "itinerary_days" (user_id, hotel_id, day_number, stop_count) VALUES (${user.id}, ${hotel.id}, 2, 0)`);
      const rows = await db.select({ dayNumber: schema.itineraryDays.dayNumber, asks: schema.itineraryDays.feedbackRequested }).from(schema.itineraryDays);
      assert.deepEqual(rows.sort((a, b) => a.dayNumber - b.dayNumber), [
        { dayNumber: 1, asks: false },
        { dayNumber: 2, asks: true },
      ]);
    } finally {
      await scratch.close();
    }
  });
});

describe("which days need feedback", () => {
  it("today's finished day, and an earlier day with a visit; not today's unfinished day", async () => {
    const guest = await seedGuest("rule");
    const earlier = await seedDay(guest, { dayNumber: 1, visited: 2 });
    const today = await seedDay(guest, { dayNumber: 3, visited: 1, pending: 1 });

    const unfinished = await listDaysNeedingFeedback(database.db, guest.user.id, { dayId: today.id, finished: false });
    assert.deepEqual(unfinished.map((day) => day.dayId), [earlier.id]);

    const finished = await listDaysNeedingFeedback(database.db, guest.user.id, { dayId: today.id, finished: true });
    assert.deepEqual(finished.map((day) => day.dayId), [today.id, earlier.id], "today's first, then the earlier day");
    assert.equal(finished[0].isToday, true);
    assert.equal(finished[0].hotelName, guest.hotelPlace.name);
  });

  it("a finished today needs it even when nothing was visited (the owner's rule, read literally)", async () => {
    const guest = await seedGuest("empty-today");
    const today = await seedDay(guest, { dayNumber: 3, visited: 0 });
    assert.deepEqual((await listDaysNeedingFeedback(database.db, guest.user.id, { dayId: today.id, finished: true })).map((d) => d.dayId), [today.id]);
  });

  it("not an earlier day on which nothing was visited", async () => {
    const guest = await seedGuest("no-visit");
    await seedDay(guest, { dayNumber: 1, visited: 0, pending: 1 });
    assert.deepEqual(await listDaysNeedingFeedback(database.db, guest.user.id, NO_TODAY), []);
  });

  it("ignores days set aside by the test-only restart", async () => {
    const guest = await seedGuest("set-aside");
    await seedDay(guest, { dayNumber: -1794400000, visited: 2, generatedAt: new Date("2026-11-11T09:00:00Z") });
    assert.deepEqual(await listDaysNeedingFeedback(database.db, guest.user.id, NO_TODAY), []);
    assert.deepEqual(await listFeedbackCandidates(database.db, guest.user.id), []);
  });

  it("never a day from before feedback shipped, even one with visits; a new day asks by default", async () => {
    const guest = await seedGuest("before-release");
    await seedDay(guest, { dayNumber: 1, visited: 3, feedbackRequested: false });
    const old = await seedDay(guest, { dayNumber: 2, visited: 1, feedbackRequested: false });
    assert.deepEqual(await listDaysNeedingFeedback(database.db, guest.user.id, NO_TODAY), []);
    assert.deepEqual(await listDaysNeedingFeedback(database.db, guest.user.id, { dayId: old.id, finished: true }), [], "not even as today's finished day");
    assert.deepEqual(await listFeedbackCandidates(database.db, guest.user.id), []);

    const fresh = await seedDay(guest, { dayNumber: 3, visited: 1 });
    assert.equal(fresh.feedbackRequested, true);
    assert.deepEqual((await listDaysNeedingFeedback(database.db, guest.user.id, NO_TODAY)).map((day) => day.dayId), [fresh.id]);
  });

  it("never counts another guest's day, and stops asking once feedback is given", async () => {
    const { db, schema } = database;
    const mine = await seedGuest("mine");
    const theirs = await seedGuest("theirs");
    const theirDay = await seedDay(theirs, { dayNumber: 1, visited: 1 });
    assert.deepEqual(await listDaysNeedingFeedback(db, mine.user.id, { dayId: theirDay.id, finished: true }), []);

    const myDay = await seedDay(mine, { dayNumber: 1, visited: 1 });
    await db.insert(schema.planDayFeedback).values(rawRow(mine, myDay));
    assert.deepEqual(await listDaysNeedingFeedback(db, mine.user.id, NO_TODAY), []);
  });
});

describe("the start-plan gate", () => {
  /** startDayForUser with the real feedback query and the real itinerary_days table; the catalogue is a fixture. */
  function gateDeps(guest: Awaited<ReturnType<typeof seedGuest>>): DailyPlanDependencies {
    const { db, schema } = database;
    const hotelPlace = makeTestPlace({ id: guest.hotelPlace.id, name: guest.hotelPlace.name, category: "hotel", latitude: 41.7, longitude: 44.8 });
    const cafe: Place = makeTestPlace({ name: "Cafe", category: "restaurant", visitDurationMinutes: 20, latitude: 41.701, longitude: 44.8 });
    const eligible: EligiblePlace[] = [
      { place: cafe, source: "partner", relationId: "contract-cafe", facilityType: null, promotion: null },
    ];
    const unused = async (): Promise<never> => {
      throw new Error("not used by startDayForUser");
    };
    return {
      resolveGuestHotelContext: async () => ({
        ok: true,
        stay: { id: guest.stay.id, checkIn: guest.stay.checkIn, checkOut: null, hotel: guest.hotel as Hotel, place: hotelPlace },
      }),
      findPreferencesForUser: async (userId) => ({ userId, principalId: null, categories: ["restaurant"], budget: null, activityLevel: null, maxDistanceMeters: null, updatedAt: NOW }),
      listEligiblePlacesForStay: async () => eligible,
      findItineraryDay: async (userId, hotelId, dayNumber, hotelStayId) =>
        (
          await db
            .select()
            .from(schema.itineraryDays)
            .where(
              and(
                eq(schema.itineraryDays.userId, userId),
                eq(schema.itineraryDays.hotelId, hotelId),
                eq(schema.itineraryDays.dayNumber, dayNumber),
                eq(schema.itineraryDays.hotelStayId, hotelStayId)
              )
            )
        )[0] ?? null,
      listItineraryStops: async () => [],
      getStopUsageHistory: async () => new Map(),
      createEmptyItineraryDay: async (input) =>
        (
          await db
            .insert(schema.itineraryDays)
            .values({ userId: input.userId, hotelId: input.hotelId, hotelStayId: input.hotelStayId, dayNumber: input.dayNumber, stopCount: 0, availableMinutes: input.availableMinutes, generatedAt: input.now })
            .returning()
        )[0] ?? null,
      appendPickedStop: unused,
      ensureDefaultAchievement: unused,
      markStopVisited: unused,
      recordVerifiedVisit: unused,
      setDayAside: unused,
      listFeedbackCandidates: (userId) => listFeedbackCandidates(db, userId),
    };
  }

  it("refuses a new plan while an earlier day is owed feedback, and allows it once feedback is given", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("gate");
    const earlier = await seedDay(guest, { dayNumber: 1, visited: 1 });

    assert.deepEqual(await startDayForUser(guest.user.id, 120, NOW, gateDeps(guest)), { ok: false, reason: "feedback_required" });
    assert.equal((await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.userId, guest.user.id))).length, 1, "no new day");

    assert.deepEqual(await submitPlanDayFeedback(db, { userId: guest.user.id, dayId: earlier.id, today: NO_TODAY, answers: answers(), now: NOW }), { ok: true });
    assert.deepEqual(await startDayForUser(guest.user.id, 120, NOW, gateDeps(guest)), { ok: true });
  });

  it("does not block on a visited day from before feedback shipped", async () => {
    const guest = await seedGuest("gate-before-release");
    await seedDay(guest, { dayNumber: 1, visited: 2, feedbackRequested: false });
    assert.deepEqual(await startDayForUser(guest.user.id, 120, NOW, gateDeps(guest)), { ok: true });
  });

  it("does not block on an earlier day with no visit", async () => {
    const guest = await seedGuest("gate-novisit");
    await seedDay(guest, { dayNumber: 1, visited: 0 });
    assert.deepEqual(await startDayForUser(guest.user.id, 120, NOW, gateDeps(guest)), { ok: true });
  });
});

describe("submitting feedback", () => {
  it("stores the answers with the day's own hotel", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("submit");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    const result = await submitPlanDayFeedback(db, {
      userId: guest.user.id,
      dayId: day.id,
      today: NO_TODAY,
      answers: answers({ overall: { rating: 2, note: "Too much walking" }, money: { rating: 1, note: "Prices higher than shown" } }),
      now: NOW,
    });
    assert.deepEqual(result, { ok: true });
    const [row] = await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.itineraryDayId, day.id));
    assert.equal(row.hotelId, guest.hotel.id);
    assert.equal(row.overallRating, 2);
    assert.equal(row.moneyNote, "Prices higher than shown");
    assert.equal(row.technicalRating, null);
  });

  it("cannot submit for another guest's day", async () => {
    const { db, schema } = database;
    const owner = await seedGuest("owner");
    const intruder = await seedGuest("intruder");
    const day = await seedDay(owner, { dayNumber: 1, visited: 1 });
    assert.deepEqual(
      await submitPlanDayFeedback(db, { userId: intruder.user.id, dayId: day.id, today: { dayId: day.id, finished: true }, answers: answers(), now: NOW }),
      { ok: false, reason: "not_needed" }
    );
    assert.equal((await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.itineraryDayId, day.id))).length, 0);
  });

  it("a second submit for the same day is harmless: already done, the first answers kept", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("twice");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    const first = { userId: guest.user.id, dayId: day.id, today: NO_TODAY, answers: answers({ overall: { rating: 5, note: null } }), now: NOW };
    assert.deepEqual(await submitPlanDayFeedback(db, first), { ok: true });
    assert.deepEqual(await submitPlanDayFeedback(db, { ...first, answers: answers({ overall: { rating: 1, note: null } }) }), {
      ok: false,
      reason: "already_done",
    });
    const rows = await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.itineraryDayId, day.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].overallRating, 5);
  });

  it("two submits at once store one row", async () => {
    const { db, schema } = database;
    const guest = await seedGuest("race");
    const day = await seedDay(guest, { dayNumber: 1, visited: 1 });
    const input = { userId: guest.user.id, dayId: day.id, today: NO_TODAY, answers: answers(), now: NOW };
    const results = await Promise.all([submitPlanDayFeedback(db, input), submitPlanDayFeedback(db, input)]);
    assert.deepEqual(results.filter((r) => r.ok).length, 1);
    assert.equal((await db.select().from(schema.planDayFeedback).where(eq(schema.planDayFeedback.itineraryDayId, day.id))).length, 1);
  });

  it("cannot submit for a day that does not need it: today's unfinished day, an earlier day with no visit, a set-aside day", async () => {
    const { db } = database;
    const guest = await seedGuest("not-needed");
    const today = await seedDay(guest, { dayNumber: 3, visited: 1, pending: 1 });
    const quiet = await seedDay(guest, { dayNumber: 1, visited: 0 });
    const setAside = await seedDay(guest, { dayNumber: -1794400000, visited: 1 });
    const beforeRelease = await seedDay(guest, { dayNumber: 2, visited: 1, feedbackRequested: false });
    for (const day of [today, quiet, setAside, beforeRelease]) {
      assert.deepEqual(
        await submitPlanDayFeedback(db, { userId: guest.user.id, dayId: day.id, today: { dayId: today.id, finished: false }, answers: answers(), now: NOW }),
        { ok: false, reason: "not_needed" },
        `day ${day.dayNumber}`
      );
    }
    assert.deepEqual(
      await submitPlanDayFeedback(db, { userId: guest.user.id, dayId: today.id, today: { dayId: today.id, finished: true }, answers: answers(), now: NOW }),
      { ok: true },
      "once today is finished it can be sent"
    );
  });
});

describe("admin feedback list", () => {
  it("lists newest first with hotel and guest, filters by hotel and note, and averages over the filter", async () => {
    const { db } = database;
    const a = await seedGuest("admin-a", "Alpha");
    const b = await seedGuest("admin-b", "Beta");
    const a1 = await seedDay(a, { dayNumber: 1, visited: 1 });
    const a2 = await seedDay(a, { dayNumber: 2, visited: 1 });
    const b1 = await seedDay(b, { dayNumber: 1, visited: 1 });
    await submitPlanDayFeedback(db, { userId: a.user.id, dayId: a1.id, today: NO_TODAY, answers: answers({ overall: { rating: 2, note: null }, map: { rating: 1, note: "Route went through a wall" } }), now: new Date("2026-11-12T10:00:00Z") });
    await submitPlanDayFeedback(db, { userId: a.user.id, dayId: a2.id, today: NO_TODAY, answers: answers({ overall: { rating: 4, note: null }, map: { rating: 3, note: null } }), now: new Date("2026-11-12T11:00:00Z") });
    await submitPlanDayFeedback(db, { userId: b.user.id, dayId: b1.id, today: NO_TODAY, answers: answers({ overall: { rating: 5, note: "Lovely" } }), now: new Date("2026-11-12T12:00:00Z") });

    const hotelA = await listFeedbackForAdmin(db, { hotelId: a.hotel.id, page: 1, pageSize: 20 });
    assert.equal(hotelA.total, 2);
    assert.deepEqual(hotelA.entries.map((entry) => entry.segments.overall.rating), [4, 2], "newest first");
    assert.equal(hotelA.entries[0].guestEmail, a.user.email);
    assert.equal(hotelA.entries[0].hotelName, a.hotelPlace.name);
    assert.equal(hotelA.averages.overall, 3);
    assert.equal(hotelA.averages.map, 2);
    assert.equal(hotelA.averages.technical, null, "nobody rated it: no average");
    assert.equal(hotelA.ratedCounts.map, 2);

    const mapNotes = await listFeedbackForAdmin(db, { hotelId: a.hotel.id, noteFor: "map", page: 1, pageSize: 20 });
    assert.equal(mapNotes.total, 1);
    assert.equal(mapNotes.entries[0].segments.map.note, "Route went through a wall");
    assert.equal(mapNotes.averages.overall, 2, "averages follow the filter");

    const paged = await listFeedbackForAdmin(db, { hotelId: a.hotel.id, page: 2, pageSize: 1 });
    assert.equal(paged.total, 2);
    assert.deepEqual(paged.entries.map((entry) => entry.segments.overall.rating), [2]);

    const hotelB = await listFeedbackForAdmin(db, { hotelId: b.hotel.id, page: 1, pageSize: 20 });
    assert.deepEqual(hotelB.entries.map((entry) => entry.guestEmail), [b.user.email]);
  });
});
