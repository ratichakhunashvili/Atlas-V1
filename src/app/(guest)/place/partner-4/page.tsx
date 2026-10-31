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

/* DetailP4 · Partner Place 4 (not in plan) — Figma frame 1:1867. Check-in stays off until it is planned. */

export const metadata: Metadata = { title: "Partner Place 4" };

export default function PartnerPlace4Page() {
  return (
    <DetailScreen
      hero={<DetailHero photo={{ src: "/atlas-ui/hero-partner-4.jpg", width: 780, height: 585 }} counter="1 / 4" />}
      actions={
        <DetailActions
          secondary={{ to: "RouteP4", icon: "/atlas-ui/icon-route-teal.svg", iconSize: 20, label: "Directions" }}
          primary={<PlanAction place="partner-4" />}
        />
      }
    >
      <DetailBody variant="partner">
        <DetailTitle eyebrow="Partner · Culture" name="Partner Place 4" gap={4}>
          <ApprovalRow chip={<LivePlanChip place="partner-4" />} />
        </DetailTitle>
        <FactStrip
          facts={[
            { label: "Walk", value: "14 min" },
            { label: "Visit", value: "60 min" },
          ]}
        />
        <WhyThis reason="Culture, and it fits your 2 h with the walk back." allBold />
        <PartnerAbout />
        <InfoRows
          rows={[
            { icon: "/atlas-ui/icon-clock.svg", label: "Opening hours", value: "[Hours, when the partner provides them]" },
            { icon: "/atlas-ui/icon-pin-ink-18.svg", label: "Address", value: "[Street address], Tbilisi" },
          ]}
        />
        <PartnerAchievementLive place="partner-4" />
      </DetailBody>
    </DetailScreen>
  );
}
