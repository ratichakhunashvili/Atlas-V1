import Link from "next/link";
import type { ReactNode } from "react";
import { chooseAgainAction, pickChoiceAction } from "@/features/plan/actions";
import type { DailyChoice } from "@/services/advisor/daily-choices";
import type { DailyPlanState, DailyStopView } from "@/services/advisor/daily-plan";
import { AtlasAsset, AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { CheckInPanel } from "./check-in-panel";
import { PlanSegment } from "./missions-chrome";
import { PendingSubmit } from "./pending-submit";
import { type } from "./ui";

/*
 * MyPlan · Missions › My plan — Figma frame 1:489 — as the guest's "choose 1 of 3" day, on real data.
 *
 * Everything shown comes from services/advisor/daily-plan.ts for the guest's own stay: the options are already
 * limited to that hotel's facilities and approved partners, and a pick is checked again on the server. This
 * screen only renders state and posts forms; it decides nothing.
 */

type Started = Exclude<DailyPlanState, { status: "no_stay" } | { status: "not_started" }>;

// Atlas starts in Georgia; the server runs in UTC, so times are shown in Tbilisi time explicitly.
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi" });
const PRICE: Record<number, string> = { 1: "Budget", 2: "Moderate", 3: "Luxury" };
const DOT = "flex size-[28px] shrink-0 items-center justify-center rounded-[14px]";
const NOTICES: Record<string, string> = {
  saved: "Saved. Your new choices apply to your next plan.",
  "pick-failed": "That option isn't available any more. Here are your current options.",
};

function label(value: string | null) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function duration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-start gap-[14px] px-[12px] pb-[24px] pt-[calc(12px+env(safe-area-inset-top))] wide:px-[24px] wide:pt-[calc(20px+env(safe-area-inset-top))]">
        <PlanSegment active="plan" />
        {children}
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="missions" />
      </div>
    </main>
  );
}

function Row({ dot, line, children }: { dot: ReactNode; line?: boolean; children: ReactNode }) {
  return (
    <li className="flex w-full items-start gap-[10px]">
      <div aria-hidden className="flex w-[28px] shrink-0 flex-col items-center self-stretch">
        {dot}
        {line ? <div className="min-h-[12px] w-[2px] flex-1 bg-atlas-beige" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-[12px]">{children}</div>
    </li>
  );
}

function HotelDot({ filled }: { filled: boolean }) {
  return (
    <div className={`${DOT} ${filled ? "bg-atlas-teal" : "border-2 border-atlas-teal bg-atlas-paper"}`}>
      <AtlasIcon src={filled ? "/atlas-ui/icon-home-light-14.svg" : "/atlas-ui/icon-home-teal-14.svg"} size={14} />
    </div>
  );
}

function DoneRow({ stop }: { stop: DailyStopView }) {
  return (
    <Row
      line
      dot={
        <div className={`${DOT} bg-atlas-teal`}>
          <AtlasIcon src="/atlas-ui/icon-check-light-14.svg" size={14} />
        </div>
      }
    >
      <p className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{stop.name}</p>
      <p className="font-manrope text-[12px] leading-[16px] text-atlas-slate">Done{stop.visitedAt ? ` · ${CLOCK.format(stop.visitedAt)}` : ""}</p>
    </Row>
  );
}

function CurrentRow({ state, testFinish }: { state: Extract<Started, { status: "in_progress" }>; testFinish: boolean }) {
  const { current } = state;
  if (!state.currentAvailable) {
    return (
      <Row line dot={<div className={`${DOT} border-2 border-dashed border-atlas-slate`} />}>
        <div className="flex w-full flex-col items-start gap-[8px] rounded-[14px] bg-atlas-sand p-[12px]">
          <p className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-slate line-through">{current.name}</p>
          <p className="font-manrope text-[13px] leading-[18px] text-atlas-ink">
            This place isn&apos;t available through {state.hotel.name} any more. Choose something else instead — it won&apos;t count
            towards your four.
          </p>
          <form action={chooseAgainAction}>
            <input type="hidden" name="stopId" value={current.id} />
            <button
              type="submit"
              className="flex h-[44px] items-center justify-center rounded-[12px] bg-atlas-teal px-[16px] font-manrope text-[14px] font-semibold text-atlas-paper"
            >
              Choose again
            </button>
          </form>
        </div>
      </Row>
    );
  }

  return (
    <Row line dot={<div className={`${DOT} border-2 border-atlas-teal bg-atlas-paper font-manrope text-[13px] font-semibold text-atlas-teal`}>{state.picksUsed}</div>}>
      <div className="flex w-full flex-col items-start gap-[8px] rounded-[14px] border-2 border-atlas-teal p-[12px]">
        <div className="flex w-full items-center justify-between gap-[8px]">
          <p className="min-w-0 font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">{current.name}</p>
          <span className="shrink-0 font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">Go here now</span>
        </div>
        <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">
          {label(current.category)} · about {duration(current.visitMinutes)} there
        </p>
        <p className="font-manrope text-[13px] leading-[18px] text-atlas-ink">
          When you get there, scan the place&apos;s Atlas QR code or check in with your location to unlock its achievement.
        </p>
        <Link
          href={`/directions?stop=${current.id}`}
          className="flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[12px] border border-atlas-teal bg-atlas-paper font-manrope text-[15px] font-semibold text-atlas-teal"
        >
          <AtlasIcon src="/atlas-ui/icon-map-teal.svg" size={16} />
          Show the walking route
        </Link>
        <CheckInPanel stopId={current.id} placeName={current.name} testScan={testFinish} />
      </div>
    </Row>
  );
}

function ChoiceCard({ choice }: { choice: DailyChoice }) {
  const big = choice.featured;
  const meta = [
    choice.source === "facility" ? "At your hotel" : `${choice.walkMinutes} min walk`,
    `${duration(choice.visitMinutes)} there`,
    choice.priceLevel ? PRICE[choice.priceLevel] : null,
  ].filter(Boolean);
  return (
    <li className="w-full">
      <form
        action={pickChoiceAction}
        className={`flex w-full flex-col items-start rounded-[16px] bg-atlas-paper ${
          big ? "gap-[10px] border-2 border-atlas-teal p-[16px] shadow-[0px_6px_18px_0px_rgba(28,41,41,0.12)]" : "gap-[6px] border border-atlas-beige p-[12px]"
        }`}
      >
        <input type="hidden" name="placeId" value={choice.placeId} />
        <div className="flex w-full items-center gap-[8px]">
          {big ? (
            <span className="flex items-center gap-[4px] rounded-[10px] bg-atlas-teal px-[8px] py-[2px] font-manrope text-[11px] font-semibold uppercase leading-[16px] tracking-[0.44px] text-atlas-paper">
              <AtlasIcon src="/atlas-ui/icon-star-light-28.svg" size={12} />
              Featured
            </span>
          ) : null}
          <span className="font-manrope text-[11px] font-semibold uppercase leading-[15px] tracking-[0.44px] text-atlas-slate">
            {choice.source === "facility" ? "Hotel" : "Partner"} · {label(choice.category)}
          </span>
        </div>
        <p className={`w-full font-grotesk font-bold text-atlas-teal [overflow-wrap:anywhere] ${big ? "text-[22px] leading-[28px]" : "text-[17px] leading-[22px]"}`}>
          {choice.name}
        </p>
        {choice.offerText ? (
          <p className="w-full rounded-[10px] bg-atlas-sand px-[10px] py-[6px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink">
            {choice.offerText}
          </p>
        ) : null}
        <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{meta.join(" · ")}</p>
        <PendingSubmit
          pendingLabel="Choosing…"
          ariaLabel={`Choose ${choice.name}`}
          className={`flex w-full items-center justify-center rounded-[12px] font-manrope font-semibold ${
            big ? "h-[52px] bg-atlas-teal text-[16px] text-atlas-paper" : "h-[44px] border border-atlas-teal text-[14px] text-atlas-teal"
          }`}
        >
          Choose this
        </PendingSubmit>
      </form>
    </li>
  );
}

function Finished({ state }: { state: Extract<Started, { status: "finished" }> }) {
  const text =
    state.reason === "limit"
      ? "That's your four activities for today. New options tomorrow."
      : state.reason === "no_time"
        ? "Nothing else fits the time you have left, including the walk back. Enjoy the rest of your day."
        : `You've done everything ${state.hotel.name} has approved for your interests today.`;
  return (
    <div className="flex w-full flex-col items-start gap-[6px] rounded-[14px] bg-atlas-sand p-[14px]">
      <p className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Your day is done</p>
      <p className="font-manrope text-[14px] leading-[19px] text-atlas-ink">{text}</p>
    </div>
  );
}

function NotStarted({ hotelName }: { hotelName: string }) {
  return (
    <Shell>
      <div className="flex w-full max-w-[560px] flex-1 flex-col items-start justify-center gap-[16px] self-center">
        <div className="w-full max-w-[366px] overflow-hidden">
          <AtlasAsset src="/atlas-ui/pattern-teal-wave.svg" width={366} height={130} className="max-w-none" />
        </div>
        <h1 className={`w-full ${type.title}`}>No plan for today yet</h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>
          Tell us how much time you have. We&apos;ll offer three things to do at a time from {hotelName} and its approved partners — up to
          four today.
        </p>
        <Link
          href="/preferences"
          className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-atlas-teal font-manrope text-[16px] font-semibold text-atlas-paper"
        >
          Plan my free time
        </Link>
        <Link href="/" className="flex h-[44px] w-full items-center justify-center font-manrope text-[15px] font-semibold text-atlas-teal">
          Browse places instead
        </Link>
      </div>
    </Shell>
  );
}

export function DailyPlanScreen({
  state,
  testFinish,
  notice,
}: {
  state: Exclude<DailyPlanState, { status: "no_stay" }>;
  testFinish: boolean;
  notice?: string;
}) {
  if (state.status === "not_started") return <NotStarted hotelName={state.hotelName} />;

  const remaining = state.remainingMinutes;
  const noticeText = notice ? NOTICES[notice] : undefined;

  return (
    <Shell>
      <div className="flex w-full flex-col items-start gap-[8px]">
        <div className="flex w-full items-center justify-between gap-[8px]">
          <h1 className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-teal">Today at {state.hotel.name}</h1>
          <Link
            href="/preferences/edit"
            className="flex h-[44px] shrink-0 items-center gap-[6px] rounded-[22px] border border-atlas-beige px-[12px] font-manrope text-[13px] font-semibold text-atlas-ink"
          >
            <AtlasIcon src="/atlas-ui/icon-edit-15.svg" size={15} />
            Preferences
          </Link>
        </div>
        <p className="font-manrope text-[13px] leading-[18px] text-atlas-ink">
          <span className="font-semibold">
            {state.completed.length} of {state.maxPicks} done
          </span>
          {remaining !== null ? ` · ${duration(remaining)} left` : ""}
        </p>
        <div
          role="progressbar"
          aria-label="Activities done today"
          aria-valuemin={0}
          aria-valuemax={state.maxPicks}
          aria-valuenow={state.completed.length}
          className="flex w-full items-start gap-[4px]"
        >
          {Array.from({ length: state.maxPicks }, (_, i) => (
            <div key={i} className={`h-[5px] flex-1 rounded-[3px] ${i < state.completed.length ? "bg-atlas-teal" : "bg-atlas-beige"}`} />
          ))}
        </div>
      </div>

      {noticeText ? (
        <p role="status" className="w-full rounded-[12px] bg-atlas-sand px-[12px] py-[10px] font-manrope text-[14px] leading-[19px] text-atlas-ink">
          {noticeText}
        </p>
      ) : null}

      <ol aria-label="Today" className="flex w-full flex-col items-start">
        <Row line dot={<HotelDot filled />}>
          <p className="pt-[4px] font-manrope text-[14px] leading-[19px] text-atlas-ink">
            <span className="font-semibold">Start at {state.hotel.name}</span> · {CLOCK.format(state.startedAt)}
          </p>
        </Row>
        {state.completed.map((stop) => (
          <DoneRow key={stop.id} stop={stop} />
        ))}
        {state.status === "in_progress" ? <CurrentRow state={state} testFinish={testFinish} /> : null}
        <Row dot={<HotelDot filled={false} />}>
          <p className="pt-[4px] font-manrope text-[14px] leading-[19px] text-atlas-ink">
            <span className="font-semibold">Back to {state.hotel.name}</span>
            {state.availableMinutes !== null
              ? ` · by ${CLOCK.format(new Date(state.startedAt.getTime() + state.availableMinutes * 60_000))}`
              : ""}
          </p>
        </Row>
      </ol>

      {state.status === "choosing" ? (
        <section aria-labelledby="choose-title" className="flex w-full flex-col items-start gap-[10px]">
          <h2 id="choose-title" className="font-grotesk text-[18px] font-bold leading-[24px] text-atlas-teal">
            {state.completed.length === 0 ? "Choose your first activity" : "Choose your next activity"}
          </h2>
          <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">
            {state.choices.length === 1
              ? `Only one approved place fits the time you have left.`
              : `${state.choices.length} options that fit your time, with the walk back to ${state.hotel.name}.`}
          </p>
          <ul className="flex w-full flex-col items-start gap-[10px]">
            {state.choices.map((choice) => (
              <ChoiceCard key={choice.placeId} choice={choice} />
            ))}
          </ul>
          {state.choices.some((choice) => choice.featured) ? (
            <p className="font-manrope text-[12px] leading-[16px] text-atlas-slate">
              Featured places are promoted by {state.hotel.name}. Every option is approved by your hotel.
            </p>
          ) : null}
        </section>
      ) : null}

      {state.status === "finished" ? <Finished state={state} /> : null}
    </Shell>
  );
}
