import type { ReactNode } from "react";
import { findActiveStayForUser, stayHasItineraryDays } from "@/db/queries/hotel-stays";
import { listUpcomingHotelEvents } from "@/db/queries/hotel-events";
import { GuestAppShell } from "@/components/guest/guest-app-shell";
import { requireUser } from "@/lib/authorization";
import { calculateDayNumber, stayEndFor } from "@/services/advisor/stay-day";
import { stayReminders } from "@/services/stays/reminders";
import { toCalendarDate } from "@/services/stays/stay-dates";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const stay = await findActiveStayForUser(user.id);
  const now = new Date();
  const events = stay ? await listUpcomingHotelEvents(stay.hotel.id, now) : [];
  const arrivalLocked = stay ? await stayHasItineraryDays({ userId: user.id, hotelId: stay.hotel.id }) : false;
  const day = stay ? calculateDayNumber(stay.checkIn, stayEndFor(stay), now) : null;

  return (
    <GuestAppShell
      isAdmin={user.role === "admin"}
      hotelName={stay?.place.name ?? null}
      checkIn={stay?.checkIn.toISOString() ?? null}
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
