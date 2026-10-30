import type { RateLimitScope } from "@/db/schema";

/**
 * How many attempts each approved scope allows, and over what window.
 *
 * These are throttles, not lockouts. The window rolls — it does not reset on a
 * schedule and it does not escalate — so a guest who fumbles their code five
 * times gets back in a few minutes later without anyone unlocking anything, and
 * there is no state that an attacker could drive into a locked position against
 * somebody else's account.
 */
export type RateLimitRule = {
  /** Attempts permitted inside the window. The limit-th attempt still passes; the one after it does not. */
  limit: number;
  windowSeconds: number;
  /**
   * Which attempts count.
   *
   * - "failures": only refused attempts. A guest checking in successfully all day
   *   is doing exactly what the product is for and must never be throttled for it.
   * - "all": every operation, successful or not. Used where the operation itself is
   *   the expensive/sensitive thing, so counting only failures would leave an
   *   unthrottled loop of successes — rotating a credential, for instance.
   */
  counts: "failures" | "all";
};

export const RATE_LIMIT_RULES: Record<RateLimitScope, RateLimitRule> = {
  // GPS and QR check-in share this bucket: both are attempts to complete a stop,
  // and allowing 10 of each would double the real allowance.
  place_check_in: { limit: 10, windowSeconds: 15 * 60, counts: "failures" },
  hotel_entry: { limit: 5, windowSeconds: 15 * 60, counts: "failures" },
  qr_credential_issue: { limit: 20, windowSeconds: 60 * 60, counts: "all" },
  // Each retry can cost a Mapbox request, so every attempt counts, not only failures.
  route_retry: { limit: 5, windowSeconds: 15 * 60, counts: "all" },
  // Looking up guest stays one at a time is support work; dozens an hour is browsing.
  support_lookup: { limit: 30, windowSeconds: 60 * 60, counts: "all" },
};

/** The moment a scope's rolling window opens, given "now". */
export function windowStart(scope: RateLimitScope, now: Date): Date {
  return new Date(now.getTime() - RATE_LIMIT_RULES[scope].windowSeconds * 1000);
}

/**
 * Whether an attempt may proceed, given how many already count against the actor.
 *
 * `attemptsInWindow` is the count BEFORE this attempt, so the rule reads exactly
 * as written: a limit of 10 permits the 10th attempt and refuses the 11th.
 */
export function isWithinLimit(scope: RateLimitScope, attemptsInWindow: number): boolean {
  return attemptsInWindow < RATE_LIMIT_RULES[scope].limit;
}

/**
 * What a throttled actor is told.
 *
 * Says only that there have been too many attempts and to wait — never which
 * credential existed, which purpose it had, or why any individual attempt failed.
 * A message that distinguishes "wrong code" from "code for another hotel" turns a
 * rate limiter into an oracle for enumerating codes.
 */
export function rateLimitedMessage(): string {
  return "Too many attempts. Wait a few minutes and try again.";
}
