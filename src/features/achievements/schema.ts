import { z } from "zod";

/**
 * A badge image is a URL Atlas renders in a browser — never something the server
 * goes and fetches.
 *
 * Nothing in Atlas requests this address: no validation fetch, no HEAD, no
 * thumbnailing. That is the whole defence against SSRF here. An admin-supplied URL
 * that the server dutifully retrieved would be a request to anything reachable
 * from inside the deployment — a metadata endpoint, an internal service — made
 * with the server's own credentials and network position. So the URL is checked
 * for shape only and stored as text.
 *
 * `http:` and `https:` only. `javascript:` would execute if it ever reached an
 * attribute, `data:` can carry a payload, and `file:` addresses the server's own
 * disk; none of them is an image hosted somewhere.
 */
export const badgeImageUrlSchema = z
  .union([z.literal(""), z.string().trim().url("Enter a valid http(s) URL").max(2000)])
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => {
      if (value === null) return true;
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Badge image must be an http(s) URL" }
  );

/**
 * Creating a badge. The Place is chosen by id and re-checked on the server: it has
 * to exist, and it cannot already have a badge (one per Place).
 */
export const createAchievementSchema = z.object({
  placeId: z.string().uuid("Choose a place"),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === "" ? null : value)),
  badgeImageUrl: badgeImageUrlSchema,
});

/** Editing a badge. The Place is deliberately absent: moving a badge to a different Place would rewrite what earned guests actually did. */
export const updateAchievementSchema = createAchievementSchema.omit({ placeId: true });

export const achievementIdSchema = z.string().uuid();

export type CreateAchievementValues = z.infer<typeof createAchievementSchema>;
export type UpdateAchievementValues = z.infer<typeof updateAchievementSchema>;
