"use client";

import { useRouter } from "next/navigation";
import { AtlasAsset, AtlasIcon } from "./asset";
import { AdvanceAfter } from "./advance-after";
import { savePlan, useDemoState } from "./demo/demo-store";
import { STOPS, clock, proposePlan, timePlan, walkMinutes, type TimeOption } from "./demo/plan-model";
import { screenHref } from "./screen-hrefs";
import { AtlasBackButton, AtlasButton, AtlasTextLink, FlowScreen, Spacer, type } from "./ui";

/*
 * PlanBuild (1:1144) and PlanBuildDone (1:1156): planning the guest's free time from their
 * choices on Preferences. Both run the prototype's planning model (demo/plan-model.ts) on the
 * same inputs, so Plan ready shows exactly what My plan will show after "Save this plan". When
 * nothing approved matches, or nothing fits the time, the flow goes to No partner fits instead.
 */

export function hoursPhrase(time: TimeOption): string {
  if (time === "1 h") return "1 hour";
  if (time === "4 h+") return "4 hours or more";
  return `${time.replace(" h", "")} hours`;
}

export function PlanBuilding() {
  const { preferences, plan } = useDemoState();
  const proposal = proposePlan(preferences, plan.completed);
  return (
    <main>
      <AdvanceAfter to={proposal.kind === "plan" ? "PlanBuildDone" : "NoMatch"} ms={2400} />
      <FlowScreen gap={14}>
        <AtlasBackButton to="Preferences" />
        <div role="status" aria-live="polite" className="flex min-h-px w-full flex-1 flex-col items-center justify-center gap-[18px]">
          <AtlasAsset src="/atlas-ui/spinner-plan.svg" width={120} height={120} className="motion-safe:animate-[spin_1.6s_linear_infinite]" />
          <h1 className={`w-full text-center ${type.title}`}>Planning your {hoursPhrase(preferences.time)}…</h1>
          <p className={`w-full text-center ${type.body} text-atlas-slate`}>
            Checking Hotel A&apos;s approved places, walk times and your way back.
          </p>
        </div>
      </FlowScreen>
    </main>
  );
}

function Note({ children }: { children: string }) {
  return (
    <div className="flex w-full items-start gap-[10px]">
      <AtlasIcon src="/atlas-ui/icon-info-slate.svg" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1 font-manrope text-[13px] leading-[1.5] text-atlas-slate">{children}</p>
    </div>
  );
}

function Stop({ n, name, meta }: { n: number; name: string; meta: string }) {
  return (
    <li className="flex w-full items-center gap-[12px] rounded-[14px] border border-atlas-beige p-[12px]">
      <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[16px] bg-atlas-teal font-manrope text-[15px] font-semibold leading-[20px] text-atlas-paper">
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
        <span className="font-manrope text-[15px] font-semibold leading-[20px] text-atlas-ink">{name}</span>
        <span className="w-full font-manrope text-[13px] leading-[18px] text-atlas-slate">{meta}</span>
      </span>
    </li>
  );
}

export function PlanReady() {
  const router = useRouter();
  const { preferences, plan } = useDemoState();
  const proposal = proposePlan(preferences, plan.completed);
  const hours = hoursPhrase(preferences.time);

  if (proposal.kind !== "plan") {
    return (
      <main>
        <FlowScreen gap={14}>
          <AtlasBackButton to="Preferences" />
          <h1 className={`w-full ${type.title}`}>Nothing fits these choices</h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            None of Hotel A&apos;s approved places match what you picked in {hours}. Change your choices, or see what the hotel offers.
          </p>
          <Spacer />
          <AtlasButton to="NoMatch">See what Hotel A offers</AtlasButton>
          <AtlasTextLink to="Preferences">Change time or interests</AtlasTextLink>
        </FlowScreen>
      </main>
    );
  }

  const proposed = { planned: true, completed: plan.completed, upcoming: proposal.stops };
  const timing = timePlan(proposed, preferences.time);
  const done = plan.completed.length;
  const count = proposal.stops.length;
  const shorter = proposal.matched > count;
  const stopWord = count === 1 ? "stop" : "stops";

  const save = () => {
    savePlan(proposal.stops);
    router.push(screenHref("MyPlan") ?? "/plan");
  };

  return (
    <main>
      <FlowScreen gap={14}>
        <AtlasBackButton to="Preferences" />
        <div className="flex w-full flex-col items-start gap-[8px]">
          <p className={type.eyebrow}>Your plan for today</p>
          <h1 className={`w-full ${type.title}`}>
            We found {count} {stopWord} that {count === 1 ? "fits" : "fit"}
          </h1>
          <Note>
            {shorter
              ? `You asked for ${hours}. Only ${count} approved ${count === 1 ? "place fits" : "places fit"} with time to walk back to Hotel A, so the plan is shorter.`
              : `You asked for ${hours}. ${count === 1 ? "It fits" : "They fit"} with time to walk back to Hotel A.`}
          </Note>
        </div>
        <ol className="flex w-full flex-col items-start gap-[10px]">
          {proposal.stops.map((id, index) => {
            const stop = STOPS[id];
            const from = index === 0 ? (plan.completed.at(-1)?.id ?? "hotel") : proposal.stops[index - 1];
            const meta =
              stop.kind === "facility"
                ? `In Hotel A · ${stop.visit} min`
                : `${walkMinutes(from, id)} min walk · ${stop.visit} min${stop.price ? ` · ${stop.price}` : ""}`;
            return <Stop key={id} n={done + index + 1} name={stop.name} meta={meta} />;
          })}
          <li className="flex w-full items-center gap-[12px] px-[12px] py-[4px]">
            <AtlasIcon src="/atlas-ui/icon-home-slate-20.svg" size={20} className="shrink-0" />
            <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">Back at Hotel A around {clock(timing.returnAt)}</p>
          </li>
        </ol>
        {done > 0 ? (
          <Note>
            {`${plan.completed.map((c) => STOPS[c.id].name).join(", ")}, where you checked in earlier, ${done === 1 ? "stays as stop 1" : "stay as they are"}. Saving replaces only the stops you have not visited yet.`}
          </Note>
        ) : null}
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[6px]">
          <AtlasButton type="button" onClick={save}>
            Save this plan
          </AtlasButton>
          <AtlasTextLink to="Preferences">Change time or interests</AtlasTextLink>
        </div>
      </FlowScreen>
    </main>
  );
}
