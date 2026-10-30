import { z } from "zod";

/**
 * The subject a credential is being issued for. Bound action arguments are
 * client-supplied like any other input, so they are validated here rather than
 * reaching Postgres as a malformed uuid and surfacing as a 500.
 */
export const credentialSubjectSchema = z.object({
  id: z.string().uuid("Invalid id"),
});
