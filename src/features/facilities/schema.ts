import { z } from "zod";
import { FACILITY_TYPES } from "@/db/schema";

export const addFacilitySchema = z.object({
  placeId: z.uuid("Select a place"),
  facilityType: z.enum([...FACILITY_TYPES], "Select a facility type"),
});

export const facilityIdSchema = z.uuid("Invalid facility");
export const hotelIdSchema = z.uuid("Invalid hotel");
