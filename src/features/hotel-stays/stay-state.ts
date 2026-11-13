import { calculateDayNumber, stayEndFor } from "@/services/advisor/stay-day";

/**
 * Where a guest's stay stands today, for the words a guest screen shows when it has no places to offer.
 *
 * Uses the same rule as eligibility (services/eligibility resolveGuestHotelContext → calculateDayNumber): a stay is
 * active from its check-in's calendar day (UTC) up to and including its end day. An open stay outside that window has
 * either not started yet or is past its dates. A stay that has been checked out (switched hotel, moved by support) is
 * no current stay at all. Pure, so the home page, Things to do, Scan and the stay pill can never disagree.
 */
export type StayFacts = {
  hotelName: string;
  checkIn: Date;
  checkOut: Date | null;
  expectedCheckOut: Date | null;
};

export type GuestStayState =
  | { kind: "none" }
  | { kind: "active"; hotelName: string }
  | { kind: "not_started"; hotelName: string; startsOn: Date }
  | { kind: "ended"; hotelName: string };

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function guestStayState(stay: StayFacts | null, now: Date): GuestStayState {
  if (!stay || stay.checkOut !== null) return { kind: "none" };
  if (calculateDayNumber(stay.checkIn, stayEndFor(stay), now).ok) return { kind: "active", hotelName: stay.hotelName };
  if (utcDay(now) < utcDay(stay.checkIn)) return { kind: "not_started", hotelName: stay.hotelName, startsOn: stay.checkIn };
  return { kind: "ended", hotelName: stay.hotelName };
}

/**
 * Where the stay-date editor lives: the "Your stay" panel of the stay pill, opened by this query parameter
 * (components/guest/guest-app-shell.tsx). Links from screens without that pill (Profile, home) go here rather than
 * duplicating the editor.
 */
export const STAY_DATES_HREF = "/experiences?stay=dates";
export const STAY_DATES_PARAM = { name: "stay", value: "dates" } as const;

/** Stay dates are calendar days stored at UTC midnight, so they are formatted in UTC to show the day the guest chose. */
const STARTS_ON = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export function formatStayStart(date: Date): string {
  return STARTS_ON.format(date);
}

export type StayStateCopy = {
  title: string;
  body: string;
  actions: { label: string; href: string }[];
};

const NO_STAY_COPY: StayStateCopy = {
  title: "No hotel stay yet",
  body: "Scan your hotel's code to start your stay. Atlas then shows what you can do around it.",
  actions: [{ label: "Go to check in", href: "/" }],
};

/**
 * What a guest screen says when the guest has no active stay to show places for. Never mentions contracts,
 * commission or approval. Returns null for an active stay: the screen then shows its normal content.
 */
export function stayStateCopy(state: GuestStayState): StayStateCopy | null {
  switch (state.kind) {
    case "active":
      return null;
    case "none":
      return NO_STAY_COPY;
    case "not_started":
      return {
        title: "Your stay hasn't started yet",
        body: `Your stay at ${state.hotelName} starts on ${formatStayStart(state.startsOn)}. Its places appear here from then.`,
        actions: [{ label: "Change your dates", href: STAY_DATES_HREF }],
      };
    case "ended":
      return {
        title: "Your stay has ended",
        body: `Your stay at ${state.hotelName} is past its dates, so Atlas isn't showing its places. Staying longer? Change your dates. Staying somewhere new? Start with that hotel's code.`,
        actions: [
          { label: "Change your dates", href: STAY_DATES_HREF },
          { label: "Go to check in", href: "/" },
        ],
      };
  }
}

/**
 * The copy for a screen that already knows it has nothing to show (eligibility refused the stay). An "active" state
 * there can only mean the dates changed between two reads, so it falls back to the no-stay words.
 */
export function noPlacesCopy(state: GuestStayState): StayStateCopy {
  return stayStateCopy(state) ?? NO_STAY_COPY;
}
