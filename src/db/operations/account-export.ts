import { asc, eq, inArray } from "drizzle-orm";
import {
  achievementUnlocks,
  achievements,
  guestPrincipals,
  guestSessions,
  hotelStays,
  hotels,
  itineraryDays,
  itineraryStops,
  pendingHotelSwitches,
  places,
  placeVisits,
  planDayFeedback,
  userIdentities,
  userPreferences,
  users,
} from "@/db/schema";
import type { AtlasDatabase } from "./types";

/*
 * "Download my data": everything Atlas keeps about ONE account, gathered for that account's owner.
 *
 * The caller (app/api/account/export) decides who is asking, from the session only; this decides what is included.
 * Takes the database handle so db/account-export.pglite.test.ts runs this exact code.
 *
 * Included: the tables whose rows belong to the user (the same set account deletion removes): the account itself,
 * stays, pending hotel switches, preferences, plan days and their stops, visits, achievement unlocks, the private
 * feedback the guest gave on their plan days, the sign-in methods (Google, and whether a password is set), and the guest principal with its sessions. Every column is chosen explicitly, so a column added later is never exported by accident.
 *
 * Left out on purpose: the password hash, Google's internal account id (an identifier Google assigned, not something the
 * guest gave Atlas; the export says Google is connected and since when), password-reset token hashes, guest-session token hashes, and the two
 * rate-limit tables (security records keyed to the account, not data the guest gave us). The saved route line of a
 * plan day is also left out: it is a drawing derived from the stops, which are included.
 */

export type AccountExport = Awaited<ReturnType<typeof gatherAccountExport>>;

export async function gatherAccountExport(db: AtlasDatabase, userId: string, now: Date = new Date()) {
  const [account] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt, updatedAt: users.updatedAt, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return null;
  // Only whether a password exists leaves this function, never the hash.
  const { passwordHash, ...accountFields } = account;
  const identities = await db
    .select({ provider: userIdentities.provider, connectedAt: userIdentities.createdAt })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))
    .orderBy(asc(userIdentities.createdAt));

  const [stays, pendingSwitches, preferences, days, visits, unlocks, principals, feedback] = await Promise.all([
    db
      .select({
        id: hotelStays.id,
        hotel: places.name,
        checkIn: hotelStays.checkIn,
        checkOut: hotelStays.checkOut,
        expectedCheckOut: hotelStays.expectedCheckOut,
        datesSource: hotelStays.datesSource,
        createdAt: hotelStays.createdAt,
      })
      .from(hotelStays)
      .innerJoin(hotels, eq(hotelStays.hotelId, hotels.id))
      .innerJoin(places, eq(hotels.placeId, places.id))
      .where(eq(hotelStays.userId, userId))
      .orderBy(asc(hotelStays.checkIn)),
    db
      .select({ hotel: places.name, createdAt: pendingHotelSwitches.createdAt, expiresAt: pendingHotelSwitches.expiresAt })
      .from(pendingHotelSwitches)
      .innerJoin(hotels, eq(pendingHotelSwitches.hotelId, hotels.id))
      .innerJoin(places, eq(hotels.placeId, places.id))
      .where(eq(pendingHotelSwitches.userId, userId)),
    db
      .select({
        categories: userPreferences.categories,
        budget: userPreferences.budget,
        activityLevel: userPreferences.activityLevel,
        maxDistanceMeters: userPreferences.maxDistanceMeters,
        updatedAt: userPreferences.updatedAt,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId)),
    db
      .select({
        id: itineraryDays.id,
        hotel: places.name,
        stayId: itineraryDays.hotelStayId,
        dayNumber: itineraryDays.dayNumber,
        stopCount: itineraryDays.stopCount,
        totalDurationSeconds: itineraryDays.totalDurationSeconds,
        availableMinutes: itineraryDays.availableMinutes,
        generatedAt: itineraryDays.generatedAt,
        completedAt: itineraryDays.completedAt,
      })
      .from(itineraryDays)
      .innerJoin(hotels, eq(itineraryDays.hotelId, hotels.id))
      .innerJoin(places, eq(hotels.placeId, places.id))
      .where(eq(itineraryDays.userId, userId))
      .orderBy(asc(itineraryDays.generatedAt)),
    db
      .select({
        place: places.name,
        firstVisitedAt: placeVisits.firstVisitedAt,
        lastVisitedAt: placeVisits.lastVisitedAt,
        visitCount: placeVisits.visitCount,
        firstVerificationMethod: placeVisits.firstVerificationMethod,
      })
      .from(placeVisits)
      .innerJoin(places, eq(placeVisits.placeId, places.id))
      .where(eq(placeVisits.userId, userId))
      .orderBy(asc(placeVisits.firstVisitedAt)),
    db
      .select({
        achievement: achievements.name,
        place: places.name,
        unlockedAt: achievementUnlocks.unlockedAt,
        verificationMethod: achievementUnlocks.verificationMethod,
      })
      .from(achievementUnlocks)
      .innerJoin(achievements, eq(achievementUnlocks.achievementId, achievements.id))
      .innerJoin(places, eq(achievements.placeId, places.id))
      .where(eq(achievementUnlocks.userId, userId))
      .orderBy(asc(achievementUnlocks.unlockedAt)),
    db
      .select({ id: guestPrincipals.id, createdAt: guestPrincipals.createdAt, lastSeenAt: guestPrincipals.lastSeenAt, linkedAt: guestPrincipals.linkedAt })
      .from(guestPrincipals)
      .where(eq(guestPrincipals.userId, userId)),
    db
      .select({
        hotel: places.name,
        planStartedAt: itineraryDays.generatedAt,
        givenAt: planDayFeedback.createdAt,
        overallRating: planDayFeedback.overallRating,
        overallNote: planDayFeedback.overallNote,
        technicalRating: planDayFeedback.technicalRating,
        technicalNote: planDayFeedback.technicalNote,
        mapRating: planDayFeedback.mapRating,
        mapNote: planDayFeedback.mapNote,
        placesRating: planDayFeedback.placesRating,
        placesNote: planDayFeedback.placesNote,
        checkinRating: planDayFeedback.checkinRating,
        checkinNote: planDayFeedback.checkinNote,
        moneyRating: planDayFeedback.moneyRating,
        moneyNote: planDayFeedback.moneyNote,
        hotelRating: planDayFeedback.hotelRating,
        hotelNote: planDayFeedback.hotelNote,
      })
      .from(planDayFeedback)
      .innerJoin(itineraryDays, eq(planDayFeedback.itineraryDayId, itineraryDays.id))
      .innerJoin(hotels, eq(planDayFeedback.hotelId, hotels.id))
      .innerJoin(places, eq(hotels.placeId, places.id))
      .where(eq(planDayFeedback.userId, userId))
      .orderBy(asc(planDayFeedback.createdAt)),
  ]);

  // Stops have no user column of their own: they are reached only through this user's days.
  const dayIds = days.map((day) => day.id);
  const stops = dayIds.length
    ? await db
        .select({
          dayId: itineraryStops.dayId,
          position: itineraryStops.position,
          name: itineraryStops.name,
          category: itineraryStops.category,
          isHotelStop: itineraryStops.isHotelStop,
          checkInMethod: itineraryStops.checkInMethod,
          visitDurationMinutes: itineraryStops.visitDurationMinutes,
          visitedAt: itineraryStops.visitedAt,
          removedFromPlanAt: itineraryStops.supersededAt,
          removedReason: itineraryStops.supersededReason,
        })
        .from(itineraryStops)
        .where(inArray(itineraryStops.dayId, dayIds))
        .orderBy(asc(itineraryStops.position))
    : [];

  // Sessions are reached only through this user's own principal; the token hash is never selected.
  const principalIds = principals.map((principal) => principal.id);
  const sessions = principalIds.length
    ? await db
        .select({
          principalId: guestSessions.principalId,
          createdAt: guestSessions.createdAt,
          lastSeenAt: guestSessions.lastSeenAt,
          idleExpiresAt: guestSessions.idleExpiresAt,
          absoluteExpiresAt: guestSessions.absoluteExpiresAt,
          revokedAt: guestSessions.revokedAt,
        })
        .from(guestSessions)
        .where(inArray(guestSessions.principalId, principalIds))
        .orderBy(asc(guestSessions.createdAt))
    : [];

  return {
    exportedAt: now.toISOString(),
    account: accountFields,
    /** How this account signs in: with a password (if one is set) and with any connected outside account. */
    signIn: { password: passwordHash !== null, connectedAccounts: identities },
    preferences: preferences[0] ?? null,
    stays,
    pendingHotelSwitches: pendingSwitches,
    plans: days.map(({ id, ...day }) => ({
      ...day,
      stops: stops.filter((stop) => stop.dayId === id).map(({ dayId: _dayId, ...stop }) => stop),
    })),
    visits,
    achievements: unlocks,
    /** Private feedback on plan days. A null rating means "didn't use it". */
    planFeedback: feedback,
    guestProfiles: principals.map(({ id, ...principal }) => ({
      ...principal,
      sessions: sessions.filter((session) => session.principalId === id).map(({ principalId: _principalId, ...session }) => session),
    })),
  };
}
