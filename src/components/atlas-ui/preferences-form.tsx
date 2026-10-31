"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { PlanFormState } from "@/features/plan/actions";
import { INTERESTS, PRICE_CHOICES, TIME_CHOICES, type Interest } from "@/features/plan/interests";
import { AtlasAsset, AtlasIcon } from "./asset";
import { ErrorBanner } from "./sign-in-form";
import { AtlasButton, type } from "./ui";

/*
 * Preferences · Plan my time — Figma frame 1:590 — and PrefsEdit · Edit preferences (70:3986), on real data.
 *
 * A plain form posted to a server action: time and price pick one option (native radios, so arrow keys work),
 * interests are checkboxes styled as chips. "Plan my time" saves the choices and starts today's
 * "choose 1 of 3"; while that runs, the Plan building screen (1:1144) is shown. Edit mode only saves — choices
 * apply to the next plan, today's stays as it is.
 */

export type PreferencesInitial = { time: string; interests: Interest[]; price: string };

type Action = (state: PlanFormState, formData: FormData) => Promise<PlanFormState>;

const OPTION =
  "flex h-[48px] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[12px] border font-manrope font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-atlas-teal border-atlas-beige bg-atlas-paper text-atlas-teal has-[:checked]:border-atlas-teal has-[:checked]:bg-atlas-teal has-[:checked]:text-atlas-paper";
const CHIP =
  "flex h-[44px] cursor-pointer items-center justify-center rounded-[22px] border px-[16px] font-manrope text-[14px] font-semibold leading-[19px] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-atlas-teal border-atlas-beige bg-atlas-paper text-atlas-teal has-[:checked]:border-atlas-teal has-[:checked]:bg-atlas-teal has-[:checked]:text-atlas-paper";
const SECTION_TITLE = "font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal";

function Radios({ name, labelId, options, value, textClass }: { name: string; labelId: string; options: readonly string[]; value: string; textClass: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex w-full items-start gap-[8px]">
      {options.map((option) => (
        <label key={option} className={`${OPTION} ${textClass}`}>
          <input type="radio" name={name} value={option} defaultChecked={option === value} required className="sr-only" />
          {option}
        </label>
      ))}
    </div>
  );
}

/** PlanBuild · Planning your time — shown over the form while the server works. */
function Building({ hotelName }: { hotelName: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-[18px] bg-atlas-paper px-[24px]">
      <AtlasAsset src="/atlas-ui/spinner-plan.svg" width={120} height={120} className="motion-safe:animate-[spin_1.6s_linear_infinite]" />
      <h1 className={`w-full max-w-[480px] text-center ${type.title}`}>Planning your time…</h1>
      <p className={`w-full max-w-[480px] text-center ${type.body} text-atlas-slate`}>
        Checking {hotelName}&apos;s approved places, walk times and your way back.
      </p>
    </div>
  );
}

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <AtlasButton type="submit" disabled={pending} className="short:flex-1">
      {children}
    </AtlasButton>
  );
}

export function PreferencesForm({
  mode,
  hotelName,
  initial,
  action,
}: {
  mode: "plan" | "edit";
  hotelName: string;
  initial: PreferencesInitial;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, {});
  const editing = mode === "edit";
  // After a refused submit, show what the guest had picked rather than resetting the form.
  const values = { time: state.time ?? initial.time, interests: state.interests ?? initial.interests, price: state.price ?? initial.price };

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <form action={formAction} className="flex flex-1 flex-col" key={JSON.stringify(values)}>
        {editing ? null : <Building hotelName={hotelName} />}
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[22px] px-[16px] pb-[24px] pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="flex w-full items-center gap-[8px]">
            <Link
              href={editing ? "/plan" : "/"}
              aria-label="Back"
              className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige"
            >
              <AtlasIcon src="/atlas-ui/icon-back.svg" size={18} />
            </Link>
            <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{editing ? "My plan" : hotelName}</p>
          </div>

          <div className="flex w-full flex-col items-start gap-[6px]">
            <h1 className={`w-full ${type.title}`}>{editing ? "Edit preferences" : "Tell us when you're free."}</h1>
            <p className={`w-full ${type.body} text-atlas-slate`}>
              {editing
                ? "Changes apply to your next plan. Today's plan stays as it is."
                : `We'll offer you three things to do at a time, from ${hotelName} and the places it has approved. Up to four a day.`}
            </p>
          </div>

          {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

          {editing ? (
            // Free time is chosen each day, not saved: the edit form only keeps interests and price.
            <input type="hidden" name="time" value={values.time} />
          ) : (
            <section className="flex w-full flex-col items-start gap-[10px]">
              <h2 id="pref-time" className={SECTION_TITLE}>
                How much time do you have?
              </h2>
              <Radios name="time" labelId="pref-time" options={TIME_CHOICES.map((c) => c.label)} value={values.time} textClass="text-[15px] leading-[20px]" />
              <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">Starting now. Every option leaves time to walk back.</p>
            </section>
          )}

          <fieldset className="flex w-full flex-col items-start gap-[10px]">
            <legend className={`${SECTION_TITLE} mb-[10px]`}>What are you curious about?</legend>
            <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">Pick as many as you like.</p>
            <div className="flex w-full flex-wrap items-start gap-[8px]">
              {INTERESTS.map((interest) => (
                <label key={interest} className={CHIP}>
                  <input type="checkbox" name="interests" value={interest} defaultChecked={values.interests.includes(interest)} className="sr-only" />
                  {interest}
                </label>
              ))}
            </div>
          </fieldset>

          <section className="flex w-full flex-col items-start gap-[10px]">
            <h2 id="pref-price" className={SECTION_TITLE}>
              Price level
            </h2>
            <Radios name="price" labelId="pref-price" options={PRICE_CHOICES.map((c) => c.label)} value={values.price} textClass="text-[13px] leading-[18px]" />
            <p className="w-full font-manrope text-[13px] leading-[1.5] text-atlas-slate">
              A general guide only. Places without a known price level can still appear.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 z-10 border-t border-atlas-beige bg-atlas-paper">
          <div className="mx-auto flex w-full max-w-[640px] flex-col items-start gap-[6px] px-[16px] pb-[calc(20px+env(safe-area-inset-bottom))] pt-[12px] short:flex-row short:items-center short:pb-[calc(10px+env(safe-area-inset-bottom))] short:pt-[10px]">
            <Submit>{editing ? "Save changes" : "Plan my time"}</Submit>
            <Link
              href={editing ? "/plan" : "/"}
              className="flex h-[44px] w-full shrink-0 items-center justify-center font-manrope text-[15px] font-semibold leading-[20px] text-atlas-teal short:w-auto short:px-[12px]"
            >
              {editing ? "Cancel" : "Just show me places"}
            </Link>
          </div>
        </div>
      </form>
    </main>
  );
}
