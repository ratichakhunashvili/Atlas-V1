import type { Metadata } from "next";
import { FacilityAchievementLink, FacilityDetail } from "@/components/atlas-ui/facility-detail";

/* FacilityDetail · Hotel facility (Spa) — Figma frame 1:872. */

export const metadata: Metadata = { title: "Spa" };

export default function SpaPage() {
  return (
    <FacilityDetail
      place="spa"
      name="Spa"
      photo={{ src: "/atlas-ui/hero-spa.jpg", width: 585, height: 780 }}
      where="Floor 2"
      visit="90 min"
      about="[What the spa offers, from Hotel A.]"
      booking="Ask the spa desk or front desk. Atlas does not take bookings."
      extra={<FacilityAchievementLink to="AchievementDetail" title="[Achievement 2]" line="Unlocked yesterday · View" />}
    />
  );
}
