import { atlasPartnerContracts, hotels, places, type NewPlace } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * GURJAANI PILOT — real places around Techpark Gurjaani (Kostava Street, Gurjaani, Kakheti), the base of the first
 * real-world Atlas pilot. Unlike dev-seed.ts these are REAL places, researched on 2026-11-07 from OpenStreetMap,
 * Wikidata and local listings (madloba.info, wander-lush.org). Coordinates are to be checked on the admin map picker.
 *
 * What a guest sees follows the catalogue rule (docs/catalogue-model-plan.md), and nothing here bends it:
 *   - Techpark Gurjaani is the base: a hotel place with a hotel record. Its QR code is issued by an admin.
 *   - Attractions (churches, museums, parks...) need no contract: published and verified ones are visible at once.
 *   - Businesses (wineries, restaurants) get a PENDING Atlas contract only. They stay hidden until an admin confirms
 *     a real agreement in /admin/contracts. No contract or partnership is invented here.
 *   - Places whose opening could not be confirmed are added as unverified drafts: hidden until an admin checks them.
 *
 * Idempotent: every row has a fixed id and conflicts are ignored, so re-running changes nothing and never overwrites
 * an admin's later edits.
 */

const ID = (n: number) => `6a2a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const GURJAANI_PILOT_IDS = {
  techparkPlace: ID(1),
  techparkHotel: ID(2),
} as const;

type PilotPlace = {
  n: number;
  name: string;
  category: NewPlace["category"];
  kind: "attraction" | "business";
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  /** False: opening or status not confirmed, so it is added as an unverified draft that no guest sees. */
  confirmedOpen?: boolean;
  visitDurationMinutes?: number;
};

export const GURJAANI_PILOT_PLACES: readonly PilotPlace[] = [
  // Attractions: visible without any contract once published and verified.
  { n: 101, name: "Kvelatsminda Church of All Saints", category: "historical", kind: "attraction", description: "A rare two-domed church from the 8th–9th century on the hillside above Gurjaani; still an active monastery.", address: "South of Gurjaani town", latitude: 41.7204, longitude: 45.7881, visitDurationMinutes: 45 },
  { n: 102, name: "Vejini Ascension Monastery", category: "historical", kind: "attraction", description: "Medieval monastery complex beside the ruins of Vejini castle.", address: "Vejini village", latitude: 41.7058, longitude: 45.803, visitDurationMinutes: 45 },
  { n: 103, name: "Holy Trinity Cathedral", category: "landmark", kind: "attraction", description: "Gurjaani's cathedral in the town centre, completed in 2012.", address: "Gurjaani town centre", latitude: 41.7414, longitude: 45.7969, visitDurationMinutes: 20 },
  { n: 104, name: "Velistsikhe St George Church and Fortress", category: "historical", kind: "attraction", description: "Historic church with its bell tower beside the ruins of a fortified hall house, in the centre of Velistsikhe.", address: "Velistsikhe village", latitude: 41.8092, longitude: 45.7582, visitDurationMinutes: 30 },
  { n: 105, name: "Vazisubani Church of the Dormition", category: "historical", kind: "attraction", description: "6th-century basilica with a cloister; the church is often locked, but the grounds are open.", address: "Vazisubani village", latitude: 41.8216, longitude: 45.7001, visitDurationMinutes: 30 },
  { n: 106, name: "Memorial of Glory Museum", category: "museum", kind: "attraction", description: "Second World War memorial museum on Tavisupleba Street.", address: "Tavisupleba Street, Gurjaani", latitude: 41.7443, longitude: 45.7877, visitDurationMinutes: 40 },
  { n: 107, name: "\"Father of a Soldier\" Monument", category: "landmark", kind: "attraction", description: "Bronze statue of the hero of the Georgian film Father of a Soldier, at the memorial complex on the highway.", address: "Gurjaani", latitude: 41.7444, longitude: 45.7868, visitDurationMinutes: 15 },
  { n: 108, name: "Akhtala Mud Volcano Park", category: "nature", kind: "attraction", description: "Park around Akhtala's mud volcanoes, known for therapeutic mud and home of the Gurjaani wine festival.", address: "Tavisupleba Street, Gurjaani", latitude: 41.7454, longitude: 45.7915, visitDurationMinutes: 45 },
  { n: 109, name: "Papa's Baghi Park", category: "nature", kind: "attraction", description: "A green square in the centre of Gurjaani.", address: "Gurjaani town centre", latitude: 41.7447, longitude: 45.7954, visitDurationMinutes: 20 },
  { n: 110, name: "Gurjaani Bazari", category: "shop", kind: "attraction", description: "The town's covered produce market.", address: "St Nino Street, Gurjaani", latitude: 41.7427, longitude: 45.799, visitDurationMinutes: 30 },
  { n: 111, name: "Nato Vachnadze House Museum", category: "museum", kind: "attraction", description: "House museum of the Georgian film actress Nato Vachnadze.", address: "Chandari, southern Gurjaani", latitude: 41.729, longitude: 45.7987, confirmedOpen: false, visitDurationMinutes: 40 },
  { n: 112, name: "Ivane Beritashvili Museum", category: "museum", kind: "attraction", description: "House museum of the physiologist Ivane Beritashvili.", address: "Vejini village", latitude: 41.7089, longitude: 45.8201, confirmedOpen: false, visitDurationMinutes: 40 },

  // Businesses: a PENDING Atlas contract only, so hidden until an admin confirms a real agreement.
  { n: 201, name: "Numisi Wine Cellar Museum", category: "winery", kind: "business", description: "An old marani turned museum, with tastings by appointment.", address: "3 Gogebashvili Street, Velistsikhe", latitude: 41.8076, longitude: 45.7506 },
  { n: 202, name: "Vakho Oqruashvili Wine Cellar", category: "winery", kind: "business", description: "Small family qvevri winery; book ahead.", address: "Velistsikhe village", latitude: 41.8063, longitude: 45.7442 },
  { n: 203, name: "Beroza's Wine Cellar", category: "winery", kind: "business", description: "Family wine cellar in Velistsikhe.", address: "Velistsikhe village", latitude: 41.8072, longitude: 45.7574 },
  { n: 204, name: "Gio's Winery", category: "winery", kind: "business", description: "Family winery in Velistsikhe.", address: "Velistsikhe village", latitude: 41.8095, longitude: 45.7548 },
  { n: 205, name: "Berika's Winery", category: "winery", kind: "business", description: "Winery with tours and tastings; booking needed.", address: "Near Velistsikhe", latitude: 41.8111, longitude: 45.7803 },
  { n: 206, name: "Nikolashvili's Wine Cellar", category: "winery", kind: "business", description: "Wine cellar with its own restaurant.", address: "Zardiashvili Street, Gurjaani", latitude: 41.7321, longitude: 45.8076 },
  { n: 207, name: "Kardanakhi 1888", category: "winery", kind: "business", description: "Winery with tastings, a restaurant and a resort.", address: "Kardanakhi village", latitude: 41.6685, longitude: 45.8843 },
  { n: 208, name: "Garden (Tvisi)", category: "restaurant", kind: "business", description: "Wine-garden restaurant popular with groups.", address: "Gurjaani", latitude: 41.7555, longitude: 45.7864 },
  { n: 209, name: "Corner Café", category: "restaurant", kind: "business", description: "Café in the centre of Gurjaani.", address: "Gurjaani town centre", latitude: 41.745, longitude: 45.7988 },
  { n: 210, name: "Velistsikhe Veranda", category: "restaurant", kind: "business", description: "Restaurant with qvevri wine tastings.", address: "Velistsikhe village", latitude: 41.8084, longitude: 45.7612, confirmedOpen: false },
];

export const GURJAANI_TECHPARK = {
  name: "Techpark Gurjaani",
  description: "GITA's technology park and Fab Lab in Gurjaani: the base of the Atlas Gurjaani pilot.",
  address: "Kostava Street, Gurjaani",
  latitude: 41.745846,
  longitude: 45.782268,
} as const;

export function pilotPlaceId(place: Pick<PilotPlace, "n">): string {
  return ID(place.n);
}

export type SeedGurjaaniResult = { places: number; contracts: number; hotel: boolean };

export async function seedGurjaaniPilot(db: AtlasDatabase, now: Date = new Date()): Promise<SeedGurjaaniResult> {
  return db.transaction(async (tx) => {
    const base = await tx
      .insert(places)
      .values({
        id: GURJAANI_PILOT_IDS.techparkPlace,
        ...GURJAANI_TECHPARK,
        category: "hotel",
        kind: "hotel",
        kindConfirmedAt: now,
        publicationStatus: "published",
        publishedAt: now,
        verificationStatus: "verified",
        verifiedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: places.id });

    const hotel = await tx
      .insert(hotels)
      .values({ id: GURJAANI_PILOT_IDS.techparkHotel, placeId: GURJAANI_PILOT_IDS.techparkPlace })
      .onConflictDoNothing()
      .returning({ id: hotels.id });

    const inserted = await tx
      .insert(places)
      .values(
        GURJAANI_PILOT_PLACES.map((place): NewPlace => {
          const open = place.confirmedOpen !== false;
          return {
            id: pilotPlaceId(place),
            name: place.name,
            description: place.description,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            category: place.category,
            kind: place.kind,
            kindConfirmedAt: now,
            visitDurationMinutes: place.visitDurationMinutes ?? null,
            publicationStatus: open ? "published" : "draft",
            publishedAt: open ? now : null,
            verificationStatus: open ? "verified" : "unverified",
            verifiedAt: open ? now : null,
          };
        })
      )
      .onConflictDoNothing()
      .returning({ id: places.id });

    // Contracts only for businesses inserted just now: a re-run must not propose a second one beside an admin's.
    const insertedIds = new Set(inserted.map((row) => row.id));
    const businesses = GURJAANI_PILOT_PLACES.filter((place) => place.kind === "business" && insertedIds.has(pilotPlaceId(place)));
    const contracts =
      businesses.length === 0
        ? []
        : await tx
            .insert(atlasPartnerContracts)
            .values(businesses.map((place) => ({ placeId: pilotPlaceId(place), status: "pending_review" as const })))
            .onConflictDoNothing()
            .returning({ id: atlasPartnerContracts.id });

    return { places: inserted.length + base.length, contracts: contracts.length, hotel: hotel.length === 1 };
  });
}
