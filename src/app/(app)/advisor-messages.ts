import type { GenerationFailureReason } from "@/services/advisor/generate-itinerary";
import type { CheckInFailureReason } from "@/services/advisor/check-in";
import type { QrCheckInFailureReason } from "@/services/advisor/check-in-qr";
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
    case "insufficient_candidates":
      return "We couldn't find enough nearby places to build a route right now.";
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
    default:
      return assertNever(reason);
  }
}

export function directionsFailureMessage(reason: RoutingFailureReason | "not_found"): string {
  switch (reason) {
    case "not_found":
      return "We couldn't find that stop.";
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
