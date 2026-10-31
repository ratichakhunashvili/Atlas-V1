import { and, count, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  hotelEvents,
  hotelPartnerships,
  hotels,
  itineraryDays,
  itineraryStops,
  places,
  qrCredentials,
  users,
} from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * Operational counts and aggregate engagement, computed from what Atlas actually recorded.
 *
 * Every figure is a COUNT over real rows, with its date range stated by the caller. Nothing is estimated, and a
 * thing Atlas does not record (place views, selections, anything client-side) has no function here at all — the page
 * says so instead of showing a made-up number. Aggregates carry no guest identifiers or locations.
 */

/**
 * A Date as a typed SQL timestamp. Inside a raw `sql` template the driver is handed the bare Date with no column to
 * infer its type from; postgres-js cannot serialise that (PGlite can, which is why only a real server showed it).
 * An ISO string with an explicit cast works on both.
 */
const at = (date: Date) => sql`${date.toISOString()}::timestamptz`;

export type DashboardCounts = {
  hotels: number;
  /** Published, verified and not archived — the Places that can reach a guest at all (a relationship is still needed). */
  eligibleCapablePlaces: number;
  /** Proposals waiting for an admin decision. */
  pendingPartnerships: number;
  /** Active AND inside their date window right now — the ones guests can actually be shown. */
  activePartnerships: number;
  /** Scheduled (not cancelled) events that have not started. */
  upcomingEvents: number;
  /** Credentials that can still be used: not revoked and not expired. */
  activeCredentials: number;
  revokedCredentials: number;
  /** Accounts holding the admin role. */
  admins: number;
};

export async function dashboardCounts(db: AtlasDatabase, now: Date): Promise<DashboardCounts> {
  const [row] = await db
    .select({
      hotels: sql<number>`(select count(*)::int from ${hotels})`,
      eligibleCapablePlaces: sql<number>`(
        select count(*)::int from ${places}
        where ${places.publicationStatus} = 'published'
          and ${places.verificationStatus} = 'verified'
          and ${places.archivedAt} is null
      )`,
      pendingPartnerships: sql<number>`(
        select count(*)::int from ${hotelPartnerships} where ${hotelPartnerships.status} = 'pending_review'
      )`,
      activePartnerships: sql<number>`(
        select count(*)::int from ${hotelPartnerships}
        where ${hotelPartnerships.status} = 'active'
          and (${hotelPartnerships.startsAt} is null or ${hotelPartnerships.startsAt} <= ${at(now)})
          and (${hotelPartnerships.endsAt} is null or ${hotelPartnerships.endsAt} > ${at(now)})
      )`,
      upcomingEvents: sql<number>`(
        select count(*)::int from ${hotelEvents}
        where ${hotelEvents.status} = 'scheduled' and ${hotelEvents.startsAt} > ${at(now)}
      )`,
      activeCredentials: sql<number>`(
        select count(*)::int from ${qrCredentials}
        where ${qrCredentials.revokedAt} is null
          and (${qrCredentials.expiresAt} is null or ${qrCredentials.expiresAt} > ${at(now)})
      )`,
      revokedCredentials: sql<number>`(
        select count(*)::int from ${qrCredentials} where ${qrCredentials.revokedAt} is not null
      )`,
      admins: sql<number>`(select count(*)::int from ${users} where ${users.role} = 'admin')`,
    })
    .from(sql`(select 1) as one`);

  return row;
}

export type RecentUse = {
  /** Plans a guest explicitly generated inside the window. */
  itinerariesGenerated: number;
  /** Stops completed through a verified check-in inside the window (replaced/removed stops are not counted). */
  verifiedStopVisits: number;
};

export async function recentUse(db: AtlasDatabase, input: { since: Date; until: Date }): Promise<RecentUse> {
  const [generated] = await db
    .select({ value: count() })
    .from(itineraryDays)
    .where(and(gte(itineraryDays.generatedAt, input.since), lt(itineraryDays.generatedAt, input.until)));

  const [visits] = await db
    .select({ value: count() })
    .from(itineraryStops)
    .where(
      and(
        isNotNull(itineraryStops.visitedAt),
        gte(itineraryStops.visitedAt, input.since),
        lt(itineraryStops.visitedAt, input.until),
        isNull(itineraryStops.supersededAt)
      )
    );

  return { itinerariesGenerated: generated.value, verifiedStopVisits: visits.value };
}

export type HotelEngagement = {
  hotelId: string;
  hotelName: string;
  /** Stays begun in the window — one per hotel entry (a QR scan, or an allowlisted non-production test entry). */
  staysStarted: number;
  /** Distinct plans generated in the window. */
  itinerariesGenerated: number;
  /** Of those, how many were completed. */
  itinerariesCompleted: number;
  /** Stops completed in the window through a verified check-in. */
  verifiedStopVisits: number;
  /** Of those, how many were at the hotel's own facilities vs external partners — see `classifiedVisits`. */
  facilityVisits: number;
  partnerVisits: number;
  /** Visits at Places that are currently neither (e.g. a relationship that has since ended). Honest remainder, not hidden. */
  unclassifiedVisits: number;
  /** Stays in the window with plans on two or more different days. */
  repeatUseStays: number;
};

/**
 * Per-hotel engagement for a period. Counts only; no guest, no coordinates, no per-person trail.
 *
 * Facility vs partner is read from TODAY's relationships, because visits do not store which relationship justified
 * them. A visit to a Place whose relationship has since ended lands in `unclassifiedVisits` rather than being
 * forced into a bucket.
 */
export async function hotelEngagement(db: AtlasDatabase, input: { since: Date; until: Date }): Promise<HotelEngagement[]> {
  type Row = {
    hotel_id: string;
    hotel_name: string;
    stays_started: number;
    itineraries_generated: number;
    itineraries_completed: number;
    verified_stop_visits: number;
    facility_visits: number;
    partner_visits: number;
    repeat_use_stays: number;
  };
  const result = await db.execute(sql`
    select
      h.id as hotel_id,
      p.name as hotel_name,
      (select count(*)::int from hotel_stays s
        where s.hotel_id = h.id and s.check_in >= ${at(input.since)} and s.check_in < ${at(input.until)}) as stays_started,
      (select count(*)::int from itinerary_days d
        where d.hotel_id = h.id and d.generated_at >= ${at(input.since)} and d.generated_at < ${at(input.until)}) as itineraries_generated,
      (select count(*)::int from itinerary_days d
        where d.hotel_id = h.id and d.generated_at >= ${at(input.since)} and d.generated_at < ${at(input.until)}
          and d.completed_at is not null) as itineraries_completed,
      (select count(*)::int from itinerary_stops st join itinerary_days d on d.id = st.day_id
        where d.hotel_id = h.id and st.visited_at >= ${at(input.since)} and st.visited_at < ${at(input.until)}
          and st.superseded_at is null) as verified_stop_visits,
      (select count(*)::int from itinerary_stops st join itinerary_days d on d.id = st.day_id
        where d.hotel_id = h.id and st.visited_at >= ${at(input.since)} and st.visited_at < ${at(input.until)}
          and st.superseded_at is null
          and exists (select 1 from hotel_facilities f where f.hotel_id = h.id and f.place_id = st.place_id)) as facility_visits,
      (select count(*)::int from itinerary_stops st join itinerary_days d on d.id = st.day_id
        where d.hotel_id = h.id and st.visited_at >= ${at(input.since)} and st.visited_at < ${at(input.until)}
          and st.superseded_at is null
          and not exists (select 1 from hotel_facilities f where f.hotel_id = h.id and f.place_id = st.place_id)
          and exists (select 1 from hotel_partnerships hp where hp.hotel_id = h.id and hp.place_id = st.place_id
                      and hp.status = 'active')) as partner_visits,
      (select count(*)::int from (
        select d.user_id from itinerary_days d
        where d.hotel_id = h.id and d.generated_at >= ${at(input.since)} and d.generated_at < ${at(input.until)}
        group by d.user_id having count(distinct d.day_number) >= 2
      ) repeated) as repeat_use_stays
    from hotels h join places p on p.id = h.place_id
    order by p.name
  `);
  // postgres-js returns the rows directly, PGlite wraps them in { rows }: accept both.
  const rows = (Array.isArray(result) ? result : (result as unknown as { rows: Row[] }).rows) as unknown as Row[];

  return rows.map((row) => {
    const verified = Number(row.verified_stop_visits);
    const facility = Number(row.facility_visits);
    const partner = Number(row.partner_visits);
    return {
      hotelId: row.hotel_id,
      hotelName: row.hotel_name,
      staysStarted: Number(row.stays_started),
      itinerariesGenerated: Number(row.itineraries_generated),
      itinerariesCompleted: Number(row.itineraries_completed),
      verifiedStopVisits: verified,
      facilityVisits: facility,
      partnerVisits: partner,
      unclassifiedVisits: Math.max(verified - facility - partner, 0),
      repeatUseStays: Number(row.repeat_use_stays),
    };
  });
}
