import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { Select } from "@/components/shared/select";
import { listHotelEventsWithVenue } from "@/db/queries/hotel-events";
import { findHotelById } from "@/db/queries/hotels";
import { listEligiblePlacesForStay } from "@/services/eligibility";
import { cancelHotelEventAction, createHotelEventAction } from "@/features/hotel-events/actions";

/**
 * Scheduled events for one hotel.
 *
 * The venue choices are exactly this hotel's eligible Places — its own facilities
 * and its confirmed partners — because an event may not put a Place in front of a
 * guest that the hotel is not approved for. The action re-checks that server-side;
 * this list only saves the admin from picking something that would be refused.
 */
export default async function HotelEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const hotel = await findHotelById(id);
  if (!hotel) notFound();

  const [events, eligible] = await Promise.all([
    listHotelEventsWithVenue(hotel.id),
    listEligiblePlacesForStay({ hotel, place: hotel.place }, new Date()),
  ]);

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/hotels/${hotel.id}`} className="text-sm text-slate-600 underline">
          ← {hotel.place.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Hotel events — {hotel.place.name}</h1>
        <p className="text-sm text-slate-500">
          Real, scheduled things happening at this hotel. The Advisor may include one in a guest&apos;s plan when it
          fits the free time they chose. Atlas does not reserve a place, hold a seat, or confirm attendance.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card className="space-y-3">
        <h2 className="font-medium">Schedule an event</h2>

        {eligible.length === 0 ? (
          <p className="text-sm text-slate-600">
            This hotel has no eligible Places yet. Add a facility or confirm a partnership first — an event has to
            happen somewhere a guest is allowed to go.
          </p>
        ) : (
          <form action={createHotelEventAction.bind(null, hotel.id)} className="space-y-3">
            <Field label="Title" name="title" required maxLength={200} />
            <Field label="Description" name="description" maxLength={2000} />
            <Select label="Venue" name="venuePlaceId" required>
              {eligible.map(({ place, source }) => (
                <option key={place.id} value={place.id}>
                  {place.name} ({source === "facility" ? "own facility" : "partner"})
                </option>
              ))}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts" name="startsAt" type="datetime-local" required />
              <Field label="Ends" name="endsAt" type="datetime-local" required />
            </div>
            <Button type="submit">Schedule event</Button>
          </form>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Scheduled</h2>

        {events.length === 0 ? (
          <EmptyState title="No events scheduled" description="Nothing is scheduled for this hotel yet." />
        ) : (
          <ul className="space-y-2">
            {events.map((event) => {
              const past = event.endsAt.getTime() < now.getTime();
              return (
                <li key={event.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{event.title}</p>
                      <p className="text-xs text-slate-500">
                        {event.venueName} · {event.startsAt.toISOString().slice(0, 16).replace("T", " ")} –{" "}
                        {event.endsAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                      </p>
                      {event.description && <p className="mt-1 text-slate-600">{event.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {event.status === "cancelled" ? "Cancelled" : past ? "Past" : "Scheduled"}
                      </span>
                      {event.status === "scheduled" && !past && (
                        <form action={cancelHotelEventAction.bind(null, hotel.id, event.id)}>
                          <Button type="submit" variant="secondary">
                            Cancel
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
