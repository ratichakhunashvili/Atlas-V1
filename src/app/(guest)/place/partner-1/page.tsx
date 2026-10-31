import type { Metadata } from "next";
import { DetailActions, LivePlanChip, PartnerAchievementLive, PlanAction } from "@/components/atlas-ui/detail-live";
import {
  ApprovalRow,
  DetailBody,
  DetailHero,
  DetailScreen,
  DetailTitle,
  FactStrip,
  InfoRows,
  PartnerAbout,
  WhyThis,
} from "@/components/atlas-ui/place-detail";

/* DetailP1 · Partner Place 1 (visited today) — Figma frame 1:1799. */

export const metadata: Metadata = { title: "Partner Place 1" };

export default function PartnerPlace1Page() {
  return (
    <DetailScreen
      hero={<DetailHero photo={{ src: "/atlas-ui/hero-partner-1.jpg", width: 520, height: 780 }} counter="1 / 4" />}
      actions={
        <DetailActions
          secondary={{ to: "RouteP1", icon: "/atlas-ui/icon-route-teal.svg", iconSize: 20, label: "Directions" }}
          primary={<PlanAction place="partner-1" />}
        />
      }
    >
      <DetailBody variant="partner">
        <DetailTitle eyebrow="Partner · Food" name="Partner Place 1" gap={4}>
          <ApprovalRow chip={<LivePlanChip place="partner-1" />} />
        </DetailTitle>
        <FactStrip
          facts={[
            { label: "Walk", value: "6 min" },
            { label: "Visit", value: "45 min" },
            { label: "Price level", value: "Moderate" },
          ]}
        />
        <WhyThis reason="Food, fits your 2 h with the walk back, Moderate price level." allBold />
        <PartnerAbout />
        <InfoRows
          rows={[
            { icon: "/atlas-ui/icon-clock.svg", label: "Opening hours", value: "[Hours, when the partner provides them]" },
            { icon: "/atlas-ui/icon-pin-ink-18.svg", label: "Address", value: "[Street address], Tbilisi" },
          ]}
        />
        <PartnerAchievementLive place="partner-1" />
      </DetailBody>
    </DetailScreen>
  );
}
