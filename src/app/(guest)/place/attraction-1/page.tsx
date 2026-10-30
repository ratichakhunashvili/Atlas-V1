import type { Metadata } from "next";
import { AttractionAchievementLive, DetailActions, PlanAction } from "@/components/atlas-ui/detail-live";
import {
  AboutBlock,
  DetailBody,
  DetailHero,
  DetailScreen,
  DetailTitle,
  FactCards,
  InfoRows,
  SourceRow,
} from "@/components/atlas-ui/place-detail";

/* AttractionDetail · Attraction details — Figma frame 1:925. Unlocked with the camera view, not a code. */

export const metadata: Metadata = { title: "Attraction 1" };

export default function AttractionPage() {
  return (
    <DetailScreen
      hero={<DetailHero photo={{ src: "/atlas-ui/hero-attraction-1.jpg", width: 780, height: 520 }} />}
      actions={
        <DetailActions
          tall
          secondary={{ to: "RouteA1", icon: "/atlas-ui/icon-route-teal-22.svg", iconSize: 22, label: "Directions" }}
          primary={<PlanAction place="attraction-1" />}
        />
      }
    >
      <DetailBody variant="place">
        <DetailTitle eyebrow="Attraction · History" name="Attraction 1" gap={6}>
          <SourceRow icon="/atlas-ui/icon-check-teal-16.svg">Recommended by Hotel A</SourceRow>
        </DetailTitle>
        <FactCards
          facts={[
            { label: "Walk", value: "20 min", note: "1.5 km" },
            { label: "Visit", value: "45 min", note: "typical" },
            { label: "Entry", value: "[entry]", note: "if known" },
          ]}
        />
        <AboutBlock text="[What the guest will see and why it matters, from a verified description.]" />
        <InfoRows
          rows={[
            { icon: "/atlas-ui/icon-clock.svg", label: "Opening hours", value: "[Hours, when known]" },
            { icon: "/atlas-ui/icon-pin-ink-18.svg", label: "Where", value: "[Address], Tbilisi" },
          ]}
        />
        <AttractionAchievementLive place="attraction-1" />
      </DetailBody>
    </DetailScreen>
  );
}
