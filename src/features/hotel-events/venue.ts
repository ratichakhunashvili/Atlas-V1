import type { EligiblePlace } from "@/services/eligibility/rules";

/**
 * Whether an event's venue is allowed to host it, judged AT THE EVENT'S OWN TIME — not at the moment an admin presses
 * save. A partnership that is active today but ends before the event, or has not started by the event, does not make
 * the venue eligible for it; and one whose window opens before the event starts but closes before it ends does not
 * either, because a guest attending the end of it would be sent to a venue the hotel no longer approves.
 *
 * `eligibleAtStart` / `eligibleAtEnd` come from the one eligibility service, evaluated at those two instants (the end
 * instant is the last moment of the event, since a partnership window is half-open). A hotel's own facility has no
 * window, so it is eligible at both whenever it is active and published.
 */
export function isVenueEligibleForEvent(input: {
  venuePlaceId: string;
  eligibleAtStart: readonly Pick<EligiblePlace, "place">[];
  eligibleAtEnd: readonly Pick<EligiblePlace, "place">[];
}): boolean {
  const at = (list: readonly Pick<EligiblePlace, "place">[]) => list.some(({ place }) => place.id === input.venuePlaceId);
  return at(input.eligibleAtStart) && at(input.eligibleAtEnd);
}

/** The last instant an event occupies. A window ending exactly when the event ends still covers it. */
export function lastMomentOf(event: { endsAt: Date }): Date {
  return new Date(event.endsAt.getTime() - 1);
}
