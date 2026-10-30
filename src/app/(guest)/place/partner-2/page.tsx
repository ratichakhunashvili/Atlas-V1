import type { Metadata } from "next";
import { DetailActions, LivePlanChip, PartnerAchievementLive } from "@/components/atlas-ui/detail-live";
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
import { AtlasButton } from "@/components/atlas-ui/ui";

/* Detail · Place details (Partner Place 2) — Figma frame 1:280. The next stop in today's plan. */

export const metadata: Metadata = { title: "Partner Place 2" };

export default function PartnerPlace2Page() {
  return (
    <DetailScreen
      hero={<DetailHero photo={{ src: "/atlas-ui/hero-partner-2.jpg", width: 780, height: 520 }} counter="1 / 4" />}
      actions={
        <DetailActions
          secondary={{ to: "MyPlan", icon: "/atlas-ui/icon-list-teal-20.svg", iconSize: 20, label: "My plan" }}
          primary={
            <AtlasButton to="Route" icon="/atlas-ui/icon-route-light.svg" className="min-w-0 flex-1">
              Get directions
            </AtlasButton>
          }
        />
      }
    >
      <DetailBody variant="partner">
        <DetailTitle eyebrow="Partner · Culture" name="Partner Place 2" gap={4}>
          <ApprovalRow chip={<LivePlanChip place="partner-2" />} />
        </DetailTitle>
        <FactStrip
          facts={[
            { label: "Walk", value: "11 min" },
            { label: "Visit", value: "60 min" },
            { label: "Price level", value: "Budget" },
          ]}
        />
        <WhyThis reason="Culture, fits your 2 h with the walk back, Budget price level." />
        <PartnerAbout />
        <InfoRows
          rows={[
            { icon: "/atlas-ui/icon-clock.svg", label: "Opening hours", value: "[Hours, when the partner provides them]" },
            { icon: "/atlas-ui/icon-pin-ink-18.svg", label: "Address", value: "[Street address], Tbilisi" },
          ]}
        />
        <PartnerAchievementLive place="partner-2" />
      </DetailBody>
    </DetailScreen>
  );
}
