import type { GenerationFailureReason } from "@/services/advisor/generate-itinerary";
import type { CheckInFailureReason } from "@/services/advisor/check-in";
import type { QrCheckInFailureReason } from "@/services/advisor/check-in-qr";
import type { PlanRepairFailureReason, RemoveUnavailableStopResult } from "@/services/advisor/plan-repair";
import type { RoutingFailureReason } from "@/services/routing";

/**
 * The only place in the Advisor UI that turns a server result's `reason`
 * into guest-facing copy. Every switch below is exhaustive over its real
 * union (no `default` branch) specifically so that if a service ever adds a
 * new failure reason, this file fails to compile until someone decides what
 * a guest should see for it — never a silent fallthrough to a raw/undefined
 * internal error string.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled Advisor failure reason: ${JSON.stringify(value)}`);
}

export function generationFailureMessage(reason: GenerationFailureReason): string {
  switch (reason) {
    case "no_active_stay":
      return "You need to be checked into a hotel to plan today's route.";
    case "outside_stay_period":
      return "Today is outside your current stay dates — check with the front desk if this looks wrong.";
    case "no_preferences":
      return "Pick your interests in your profile before generating a plan.";
    case "no_eligible_experiences":
      return "Your hotel has no approved facilities or partners that match your interests yet. Try different interests, or ask the front desk.";
    case "routing_failed":
      return "We couldn't calculate walking directions right now. Please try again.";
    case "persistence_failed":
      return "Something went wrong saving your route. Please try again.";
    default:
      return assertNever(reason);
  }
}

export function gpsCheckInFailureMessage(reason: CheckInFailureReason): string {
  switch (reason) {
    case "not_found":
      return "We couldn't find that stop.";
    case "invalid_coordinates":
      return "We couldn't read your location. Please try again.";
    case "stop_not_next":
      return "This isn't your current stop yet.";
    case "stop_unavailable":
      return "This stop is no longer available through your hotel. Update your plan to continue.";
    case "wrong_day":
      return "That stop belongs to a different day's route, so it can't be checked in now.";
    case "out_of_range":
      return "You're not close enough yet. Move closer to the location and try again.";
    default:
      return assertNever(reason);
  }
}

export function qrCheckInFailureMessage(reason: QrCheckInFailureReason): string {
  switch (reason) {
    case "invalid_qr":
      return "That QR code isn't valid for this location.";
    case "no_active_itinerary":
      return "You don't have an active route right now.";
    case "place_not_next":
      return "This isn't your current stop yet.";
    case "stop_unavailable":
      return "This stop is no longer available through your hotel. Update your plan to continue.";
    case "wrong_day":
      return "That stop belongs to a different day's route, so it can't be checked in now.";
    default:
      return assertNever(reason);
  }
}

export function directionsFailureMessage(reason: RoutingFailureReason | "not_found" | "stop_unavailable"): string {
  switch (reason) {
    case "not_found":
      return "We couldn't find that stop.";
    case "stop_unavailable":
      return "This stop is no longer available through your hotel.";
    case "invalid_input":
      return "We couldn't read your location. Please try again.";
    case "config":
      return "Directions aren't available right now.";
    case "http":
      return "We couldn't reach the directions service. Please try again.";
    case "no_route":
      return "We couldn't find a walking route right now.";
    case "malformed_response":
      return "We couldn't read the directions response. Please try again.";
    case "network":
      return "Network issue — please try again.";
    default:
      return assertNever(reason);
  }
}

/** Copy for the explicit "update my plan" action (replace unavailable stops). */
export function planRepairFailureMessage(reason: PlanRepairFailureReason): string {
  switch (reason) {
    case "no_active_stay":
      return "You need to be checked into a hotel to update your route.";
    case "outside_stay_period":
      return "Today is outside your current stay dates.";
    case "no_itinerary":
      return "You don't have a route for today yet.";
    case "nothing_to_regenerate":
      return "None of your remaining stops is unavailable, so there is nothing to update.";
    case "no_replacement_available":
      return "No other approved experience matches your interests right now. You can remove the unavailable stop to continue.";
    case "routing_failed":
      return "We couldn't calculate walking directions right now, so your plan was not changed. Please try again.";
    case "conflict":
      return "Your plan changed while we were updating it. Nothing was changed — please try again.";
    default:
      return assertNever(reason);
  }
}

/** Copy for the explicit "remove this stop" action. */
export function removeStopFailureMessage(reason: Extract<RemoveUnavailableStopResult, { ok: false }>["reason"]): string {
  switch (reason) {
    case "not_found":
      return "We couldn't find that stop.";
    case "not_pending":
      return "Completed stops can't be removed.";
    case "stop_still_available":
      return "This stop is still available through your hotel, so it can't be removed.";
    case "not_removable":
      return "This stop can't be removed right now.";
    case "no_active_stay":
    case "outside_stay_period":
    case "no_itinerary":
    case "nothing_to_regenerate":
    case "no_replacement_available":
    case "routing_failed":
    case "conflict":
      return planRepairFailureMessage(reason);
    default:
      return assertNever(reason);
  }
}
