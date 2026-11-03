import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LiveUnlocked } from "@/components/atlas-ui/live-unlocked";
import { findAchievementForPlace } from "@/db/queries/achievements";
import { findItineraryStopWithDay } from "@/db/queries/itinerary";
import { listAchievementUnlocksForUser } from "@/db/queries/place-visits";
import { requireUser } from "@/lib/authorization";
import { getDailyPlanForUser } from "@/services/advisor/daily-plan";

/*
 * Unlocked · Achievement unlocked — Figma frame 1:466 — for one checked-in stop of the guest's own day.
 * Read-only. The stop id in the address is only a pointer: the stop must belong to this guest and be visited.
 */

export const metadata: Metadata = { title: "Achievement unlocked" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ stop?: string }> }) {
  const user = await requireUser();
  const stopId = z.string().uuid().safeParse((await searchParams).stop);
  if (!stopId.success) redirect("/plan");

  const found = await findItineraryStopWithDay(stopId.data);
  if (!found || found.day.userId !== user.id || !found.stop.visitedAt || !found.stop.placeId) redirect("/plan");
  const { stop, day } = found;
  const placeId = found.stop.placeId;
  const visitedAt = found.stop.visitedAt;

  const [achievement, unlocks, plan] = await Promise.all([
    findAchievementForPlace(placeId),
    listAchievementUnlocksForUser(user.id),
    getDailyPlanForUser(user.id),
  ]);
  const unlock = achievement ? unlocks.find((row) => row.achievement.id === achievement.id)?.unlock : undefined;
  // Earned during today's plan = new; earned on an earlier day = already in the collection.
  const newlyUnlocked = unlock !== undefined && unlock.unlockedAt.getTime() >= day.generatedAt.getTime();

  return (
    <LiveUnlocked
      achievementName={achievement?.name ?? `Visited ${stop.name}`}
      badgeImageUrl={achievement?.badgeImageUrl ?? null}
      placeName={stop.name}
      visitedAt={visitedAt}
      newlyUnlocked={newlyUnlocked}
      next={plan.status === "choosing" ? "next" : "done"}
    />
  );
}
