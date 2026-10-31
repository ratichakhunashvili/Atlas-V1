import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveRoute } from "@/components/atlas-ui/map/live-route";
import { requireUser } from "@/lib/authorization";
import { getDailyPlanForUser } from "@/services/advisor/daily-plan";

/*
 * Route · Walking route — Figma frame 1:731 — to the place the guest chose today, on the shared map.
 * Only the guest's CURRENT, still-available activity can be routed to; anything else goes back to My plan.
 */

export const metadata: Metadata = { title: "Walking route" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ stop?: string }> }) {
  const user = await requireUser();
  const [{ stop }, plan] = await Promise.all([searchParams, getDailyPlanForUser(user.id)]);
  if (plan.status !== "in_progress" || !plan.currentAvailable || plan.current.id !== stop) redirect("/plan");

  return (
    <LiveRoute
      stopId={plan.current.id}
      placeName={plan.current.name}
      placeAt={[plan.current.longitude, plan.current.latitude]}
      hotelName={plan.hotel.name}
      hotelAt={[plan.hotel.longitude, plan.hotel.latitude]}
    />
  );
}
