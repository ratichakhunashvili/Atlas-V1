import { z } from "zod";
import { HASH_HEX_LENGTH } from "@/services/ar/hash";

/**
 * The admin boundary for AR targets.
 *
 * `targetHash` is the only thing accepted. There is deliberately no field for an
 * image: the admin's browser reduces the chosen file to a hash and the file never
 * leaves their machine, so the server has nothing to store, serve or lose.
 */
export const arTargetSchema = z.object({
  placeId: z.string().uuid(),
  targetHash: z
    .string()
    .regex(new RegExp(`^[0-9a-f]{${HASH_HEX_LENGTH}}$`), "The reference could not be read from that image."),
  // A note for whoever maintains the target — "the front entrance, from the
  // square". Trimmed and capped; an empty note is stored as null rather than "".
  description: z.string().trim().max(200).optional(),
});

export const arTargetIdSchema = z.string().uuid();
