import type { ReactNode } from "react";
import { findActiveStayForUser, stayHasItineraryDays } from "@/db/queries/hotel-stays";
import { GuestAppShell } from "@/components/guest/guest-app-shell";
import { guestStayState } from "@/features/hotel-stays/stay-state";
import { requireUser } from "@/lib/authorization";
import { calculateDayNumber, stayEndFor } from "@/services/advisor/stay-day";
import { listUpcomingHotelEventsForGuest } from "@/services/eligibility";
import { stayReminders } from "@/services/stays/reminders";
import { toCalendarDate } from "@/services/stays/stay-dates";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const stay = await findActiveStayForUser(user.id);
  const now = new Date();
  // The same events the map and place list show: this guest's own hotel, venue still in the catalogue at the event's
  // time, under way or within 7 days (services/eligibility listUpcomingHotelEventsForGuest).
  const events = stay ? await listUpcomingHotelEventsForGuest({ userId: user.id }, now) : [];
  const arrivalLocked = stay ? await stayHasItineraryDays({ userId: user.id, hotelId: stay.hotel.id }) : false;
  const day = stay ? calculateDayNumber(stay.checkIn, stayEndFor(stay), now) : null;
  const phase = guestStayState(
    stay ? { hotelName: stay.place.name, checkIn: stay.checkIn, checkOut: stay.checkOut, expectedCheckOut: stay.expectedCheckOut } : null,
    now
  ).kind;

  return (
    <GuestAppShell
      isAdmin={user.role === "admin"}
      hotelName={stay?.place.name ?? null}
      checkIn={stay?.checkIn.toISOString() ?? null}
      stayPhase={phase === "none" ? null : phase}
      stayDates={
        stay
          ? {
              checkInDate: toCalendarDate(stay.checkIn),
              expectedCheckOutDate: stay.expectedCheckOut ? toCalendarDate(stay.expectedCheckOut) : null,
              datesSource: stay.datesSource,
              arrivalLocked,
              dayNumber: day?.ok ? day.dayNumber : null,
            }
          : null
      }
      reminders={stay ? stayReminders({ expectedCheckOut: stay.expectedCheckOut, now }) : []}
      upcomingEvents={events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
      }))}
    >
      {children}
    </GuestAppShell>
  );
}
