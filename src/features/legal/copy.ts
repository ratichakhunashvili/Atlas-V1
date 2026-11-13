/*
 * Interim wording for Terms of use and the Privacy notice.
 *
 * TODO (RELEASE BLOCKER, owner): approved legal text and a real support email address do not exist in the
 * repo yet. Until they are supplied, these screens say plainly what Atlas stores (taken from the code) and
 * that the full documents are being finalised. Do not invent legal terms here.
 */
export const LEGAL_PENDING_NOTE = "The full document is being finalised. It will be published here before Atlas opens to guests.";

/*
 * When the guest's location leaves their phone, taken from the code:
 *  - check-in (features/advisor/actions.ts checkInGpsAction): the position goes to Atlas, which compares it with the
 *    stop and keeps only that the visit happened (time and method), not the position;
 *  - the walking route (getDirectionsToStopAction -> services/routing getWalkingDirections): the position goes to
 *    Atlas, which sends it with the destination to Mapbox Directions to work out the path. Atlas does not save it.
 * Keep these sentences true if either flow changes (src/features/legal/location-disclosure.test.ts).
 */

/** One line for "What Atlas uses". */
export const LOCATION_USE =
  "Location: to show walk times, draw your walking route and confirm check-ins. It is sent when you check in and when you open a walking route, which Atlas works out with its map provider, Mapbox. Atlas does not save it.";

/** The permission screen's reassurance about when location leaves the phone. */
export const LOCATION_SENT_WHEN =
  "Your location is sent when you check in and when you open a walking route, which Atlas works out with its map provider, Mapbox. Atlas does not save it.";

/** What Atlas stores, from the schema and the sign-up, check-in and plan features. */
export const DATA_WE_STORE = [
  "Your account: email, an optional first name, and a password stored only as a one-way hash. If you sign in with Google, Atlas uses your Google email as your account email and also keeps the id Google uses for your account. It never sees your Google password and stores nothing else from Google.",
  "Your stay: which hotel you are staying at and your dates.",
  "Your interests and free time, your plan, and the places you check in at and achievements you unlock.",
  "The feedback you give after a plan day: your ratings and any notes. Only the Atlas team reads it; other guests never see it.",
  "Your location is not stored. It is sent to Atlas when you check in, to confirm you are there, and when you open a walking route, when Atlas passes it to its map provider, Mapbox, to work out the route.",
];

export const TERMS_SUMMARY = "Atlas helps you make the most of a hotel stay. Use it for your own stay and keep your sign-in details private.";
