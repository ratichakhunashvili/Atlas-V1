/*
 * Sample data for the admin panel, copied from the Figma admin frames (70:780–70:2027).
 *
 * The design labels every table "Sample data for the prototype.", and the bracketed values
 * ("[date]", "[hours]", "[admin@email.com]") are the design's own placeholders. Nothing here is
 * read from or written to a database: the admin forms do not save.
 */

import type { AdminStatus } from "./status-pill";

export const ADMIN_EMAIL = "[admin@email.com]";

export type AdminHotel = { name: string; city: string; facilities: number; activePartners: number; status: AdminStatus };

export const ADMIN_HOTELS: readonly AdminHotel[] = [
  { name: "Hotel A", city: "Tbilisi", facilities: 2, activePartners: 3, status: "Active" },
  { name: "Hotel B", city: "Batumi", facilities: 1, activePartners: 0, status: "Active" },
  { name: "Hotel C", city: "Telavi", facilities: 0, activePartners: 0, status: "Inactive" },
];

export type AdminPlace = {
  name: string;
  category: string;
  /** Null renders as "Not set": the design only sets a price level with evidence. */
  priceLevel: string | null;
  verified: boolean;
  status: AdminStatus;
};

export const ADMIN_PLACES: readonly AdminPlace[] = [
  { name: "Partner Place 1", category: "Restaurant", priceLevel: "Moderate", verified: true, status: "Published" },
  { name: "Partner Place 2", category: "Museum", priceLevel: "Budget", verified: true, status: "Published" },
  { name: "Partner Place 3", category: "Market", priceLevel: null, verified: true, status: "Published" },
  { name: "Partner Place 4", category: "Gallery", priceLevel: null, verified: true, status: "Published" },
  { name: "Attraction 1", category: "Landmark", priceLevel: null, verified: true, status: "Draft" },
];

export type AdminPartnership = { hotel: string; place: string; status: AdminStatus; window: string; updated: string };

export const ADMIN_PARTNERSHIPS: readonly AdminPartnership[] = [
  { hotel: "Hotel A", place: "Partner Place 1", status: "Active", window: "[start] – [end]", updated: "[date]" },
  { hotel: "Hotel A", place: "Partner Place 2", status: "Active", window: "[start] – [end]", updated: "[date]" },
  { hotel: "Hotel A", place: "Partner Place 3", status: "Revoked", window: "[start] – [end]", updated: "[date]" },
  { hotel: "Hotel A", place: "Partner Place 4", status: "Active", window: "[start] – [end]", updated: "[date]" },
  { hotel: "Hotel B", place: "Partner Place 1", status: "Expired", window: "[start] – [end]", updated: "[date]" },
];

export type AdminFacility = { name: string; hotel: string; type: string; hours: string; status: AdminStatus };

export const ADMIN_FACILITIES: readonly AdminFacility[] = [
  { name: "Pool", hotel: "Hotel A", type: "Pool", hours: "[hours]", status: "Published" },
  { name: "Spa", hotel: "Hotel A", type: "Spa", hours: "[hours]", status: "Published" },
  { name: "Gym", hotel: "Hotel B", type: "Gym", hours: "[hours]", status: "Draft" },
];

export type AdminQrCode = { label: string; purpose: AdminStatus; target: string; expires: string; status: AdminStatus };

export const ADMIN_QR_CODES: readonly AdminQrCode[] = [
  { label: "Hotel A entrance card", purpose: "Hotel entry", target: "Hotel A", expires: "[date]", status: "Active" },
  { label: "Partner Place 2 counter", purpose: "Place check-in", target: "Partner Place 2", expires: "[date]", status: "Active" },
  { label: "Partner Place 1 counter", purpose: "Place check-in", target: "Partner Place 1", expires: "[date]", status: "Expired" },
  { label: "Old hotel card", purpose: "Hotel entry", target: "Hotel A", expires: "[date]", status: "Revoked" },
];

/** The code the AdminQRCreated and AdminQRRevoke frames are about. */
export const SAMPLE_QR_CODE = ADMIN_QR_CODES[1];
export const SAMPLE_QR_LINK = "[short link]";

export type AdminAchievement = { name: string; place: string; unlockMethod: string; status: AdminStatus; unlocks: number };

export const ADMIN_ACHIEVEMENTS: readonly AdminAchievement[] = [
  { name: "[Achievement 1]", place: "Partner Place 1", unlockMethod: "Scan place code", status: "Published", unlocks: 12 },
  { name: "[Achievement 2]", place: "Spa", unlockMethod: "Check in with location", status: "Published", unlocks: 8 },
  { name: "[Achievement 3]", place: "Partner Place 2", unlockMethod: "Scan place code", status: "Published", unlocks: 0 },
  { name: "[Achievement 5]", place: "Partner Place 4", unlockMethod: "Scan place code", status: "Draft", unlocks: 0 },
];

/* Choices for the form selects. Only the values the design shows, plus their obvious siblings. */
export const HOTEL_NAMES = ADMIN_HOTELS.map((hotel) => hotel.name);
export const PLACE_NAMES = ADMIN_PLACES.map((place) => place.name);
export const TIME_ZONES = ["Asia/Tbilisi"];
export const HOTEL_STATUSES = ["Active", "Inactive"];
export const PLACE_CATEGORIES = ["Restaurant", "Museum", "Market", "Gallery", "Landmark"];
export const PRICE_LEVELS = ["Not set", "Budget", "Moderate"];
export const PUBLISH_STATUSES = ["Published", "Draft"];
export const PARTNERSHIP_STATUSES = ["Active", "Revoked", "Expired"];
export const FACILITY_TYPES = ["Pool", "Spa", "Gym", "Restaurant", "Event"];
export const QR_PURPOSES = ["Hotel entry", "Place check-in"];
export const UNLOCK_METHODS = ["Scan place code", "Check in with location"];
/** Places an achievement can sit at: external places and hotel-owned facilities. */
export const ACHIEVEMENT_PLACES = [...PLACE_NAMES, ...ADMIN_FACILITIES.map((facility) => facility.name)];
