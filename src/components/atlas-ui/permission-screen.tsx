import type { ScreenKey } from "./screen-hrefs";
import { AtlasBackButton, AtlasBadge, AtlasButton, AtlasPoints, AtlasTextLink, FlowScreen, Spacer, type } from "./ui";

/*
 * Permission request — the shared layout of PermLocation (1:810) and PermCamera (1:841):
 * a 72px teal badge, a title and explanation, three reassurances, and allow / not-now actions
 * above a small footnote.
 */

export type PermissionScreenProps = {
  back: ScreenKey;
  icon: string;
  title: string;
  body: string;
  reassurances: string[];
  allowLabel: string;
  allowTo: ScreenKey;
  declineLabel: string;
  declineTo: ScreenKey;
  footnote: string;
};

export function PermissionScreen(props: PermissionScreenProps) {
  return (
    <FlowScreen>
      <AtlasBackButton to={props.back} />
      <div className="flex w-full flex-col items-start gap-[16px] pt-[8px]">
        <AtlasBadge icon={props.icon} iconSize={32} size={72} />
        <h1 className={`w-full ${type.title}`}>{props.title}</h1>
        <p className={`w-full ${type.body} text-atlas-ink`}>{props.body}</p>
      </div>
      <AtlasPoints items={props.reassurances.map((text) => ({ icon: "/atlas-ui/icon-check-teal.svg", text }))} />
      <Spacer />
      <div className="flex w-full flex-col items-start gap-[6px]">
        <AtlasButton to={props.allowTo}>{props.allowLabel}</AtlasButton>
        <AtlasTextLink to={props.declineTo}>{props.declineLabel}</AtlasTextLink>
        <p className={`w-full text-center ${type.caption}`}>{props.footnote}</p>
      </div>
    </FlowScreen>
  );
}
