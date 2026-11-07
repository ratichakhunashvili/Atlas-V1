import type { EligiblePlace } from "@/services/eligibility/rules";

/**
 * Whether an event's venue is allowed to host it, judged AT THE EVENT'S OWN TIME — not at the moment an admin presses
 * save. The venue must be in the Atlas catalogue for this hotel's guests (docs/catalogue-model-plan.md): the hotel's
 * own facility, an attraction, or a business whose Atlas contract is in force. An Atlas contract that is active today
 * but ends before the event, or has not started by it, does not make the venue eligible; nor does one that ends in the
 * middle of the event, because a guest attending the end of it would be sent to a place that has left the catalogue.
 * A hotel partnership plays no part: it only promotes.
 *
 * `eligibleAtStart` / `eligibleAtEnd` come from the one eligibility service, evaluated at those two instants (the end
 * instant is the last moment of the event, since a contract window is half-open). A facility or attraction has no
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
