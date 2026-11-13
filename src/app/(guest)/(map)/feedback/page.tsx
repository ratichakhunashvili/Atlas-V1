import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AtlasBottomBar } from "@/components/atlas-ui/bottom-bar";
import { FeedbackForm } from "@/components/atlas-ui/feedback-form";
import { type } from "@/components/atlas-ui/ui";
import { submitFeedbackAction } from "@/features/feedback/actions";
import { FEEDBACK_COPY } from "@/features/feedback/copy";
import { findDaysOwingFeedback } from "@/features/feedback/owed";
import { requireUser } from "@/lib/authorization";
import { DAY_MONTH_YEAR } from "@/lib/format";

/*
 * Private feedback after a plan day (Phase 2). Required before the next plan, but never a wall around the app: this
 * screen keeps the bottom bar, so Profile, Privacy, Help and sign-out stay one tap away. Only the Atlas team reads the
 * answers. The day shown is worked out on the server from the guest's own days; the form's day id is checked again
 * when it is posted.
 */

export const metadata: Metadata = { title: "Your feedback" };
export const dynamic = "force-dynamic";

const PRIMARY_LINK =
  "flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-atlas-teal font-manrope text-[16px] font-semibold text-atlas-paper";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[20px] px-[16px] pb-[24px] pt-[calc(24px+env(safe-area-inset-top))]">
        {children}
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="missions" />
      </div>
    </main>
  );
}

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const [{ done }, { owed }] = await Promise.all([searchParams, findDaysOwingFeedback(user.id)]);
  const thanked = done === "1";
  const day = owed[0];

  if (!day) {
    return (
      <Shell>
        <div className="flex w-full flex-1 flex-col items-start justify-center gap-[16px]">
          <h1 className={`w-full ${type.title}`}>{thanked ? FEEDBACK_COPY.thanksTitle : FEEDBACK_COPY.nothingTitle}</h1>
          <p role={thanked ? "status" : undefined} className={`w-full ${type.body} text-atlas-slate`}>
            {thanked ? FEEDBACK_COPY.thanksText : FEEDBACK_COPY.nothingText}
          </p>
          <Link href="/plan" className={PRIMARY_LINK}>
            {thanked ? FEEDBACK_COPY.planAgain : FEEDBACK_COPY.backToPlan}
          </Link>
        </div>
      </Shell>
    );
  }

  const more = owed.length - 1;
  return (
    <Shell>
      <div className="flex w-full flex-col items-start gap-[6px]">
        {thanked ? (
          <p role="status" className="w-full rounded-[12px] bg-atlas-sand px-[12px] py-[10px] font-manrope text-[14px] leading-[19px] text-atlas-ink">
            {FEEDBACK_COPY.thanksNext}
          </p>
        ) : null}
        <h1 className={`w-full ${type.title}`}>{FEEDBACK_COPY.title}</h1>
        <p className="w-full font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink">
          {FEEDBACK_COPY.dayLine(day.hotelName, DAY_MONTH_YEAR.format(day.startedAt))}
        </p>
        <p className={`w-full ${type.body} text-atlas-slate`}>{FEEDBACK_COPY.intro}</p>
        {more > 0 ? <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{FEEDBACK_COPY.moreAfter(more)}</p> : null}
      </div>
      {/* Keyed by day: after one day is sent, the next owed day gets a fresh, empty form. */}
      <FeedbackForm key={day.dayId} dayId={day.dayId} action={submitFeedbackAction} />
    </Shell>
  );
}
