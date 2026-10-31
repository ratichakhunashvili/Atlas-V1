"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setPreferences, useDemoState } from "./demo/demo-store";
import { DAY_START, INTERESTS, PRICE_OPTIONS, TIME_OPTIONS, clock, hoursOf, type Interest, type Preferences } from "./demo/plan-model";
import { screenHref } from "./screen-hrefs";
import { AtlasBackButton, AtlasButton, AtlasTextLink, type } from "./ui";

/*
 * Preferences · Plan my time — Figma frame 1:590, with the Time picker (1:62), Interest chip
 * (1:115) and Price picker (1:120) components. Time and price pick one option (native radio
 * groups, so arrow keys work); interests are multi-select. "Starting" updates its return time
 * from the chosen duration.
 *
 * The choices are kept in the demo state, so Plan building, Plan ready, My plan and the context
 * header all use what the guest picked. "Plan my time" runs the prototype's planning model;
 * in the product this is where the request goes to the server.
 *
 * PrefsEdit · Edit preferences — Figma frame 70:3986 — is the same form opened from Profile
 * (`mode="edit"`): choices stay a draft until "Save changes", so Cancel really discards them, and
 * saving changes only future plans — today's plan is left as it is.
 */

const OPTION =
  "flex h-[48px] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[12px] border font-manrope font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-atlas-teal";

function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
  labelId,
  textClass,
}: {
  name: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labelId: string;
  textClass: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex w-full items-start gap-[8px]">
      {options.map((option) => {
        const selected = option === value;
        return (
          <label
            key={option}
            className={`${OPTION} ${textClass} ${selected ? "border-atlas-teal bg-atlas-teal text-atlas-paper" : "border-atlas-beige bg-atlas-paper text-atlas-teal"}`}
          >
            <input type="radio" name={name} value={option} checked={selected} onChange={() => onChange(option)} className="sr-only" />
            {option}
          </label>
        );
      })}
    </div>
  );
}

const SECTION_TITLE = "font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal";

export function PreferencesForm({ mode = "plan" }: { mode?: "plan" | "edit" }) {
  const router = useRouter();
  const { preferences: saved } = useDemoState();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const editing = mode === "edit";
  const preferences = editing ? (draft ?? saved) : saved;
  const { time, interests, price } = preferences;
  const update = editing ? setDraft : setPreferences;

  const toggleInterest = (interest: Interest) =>
    update({
      ...preferences,
      interests: interests.includes(interest) ? interests.filter((item) => item !== interest) : [...interests, interest],
    });

  const save = () => {
    if (draft) setPreferences(draft);
    router.push(screenHref("Stay") ?? "/profile");
  };

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[22px] px-[16px] pb-[24px] pt-[calc(16px+env(safe-area-inset-top))]">
        <div className="flex w-full items-center gap-[8px]">
          <AtlasBackButton to={editing ? "Stay" : "Main"} />
          <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{editing ? "Profile" : "Hotel A"}</p>
        </div>

        <div className="flex w-full flex-col items-start gap-[6px]">
          {editing ? (
            <>
              <h1 className={`w-full ${type.title}`}>Edit preferences</h1>
              <p className={`w-full ${type.body} text-atlas-slate`}>Changes apply to new plans. Your current plan stays as it is.</p>
            </>
          ) : (
            <>
              <h1 className={`w-full ${type.title}`}>Tell us when you&apos;re free.</h1>
              <p className={`w-full ${type.body} text-atlas-slate`}>
                We&apos;ll figure out what you can do with Hotel A and its approved partners.
              </p>
            </>
          )}
        </div>

        <section className="flex w-full flex-col items-start gap-[10px]">
          <h2 id="pref-time" className={SECTION_TITLE}>
            How much time do you have?
          </h2>
          <div className="flex w-full flex-col items-start gap-[10px]">
            <Segmented
              name="time"
              options={TIME_OPTIONS}
              value={time}
              onChange={(next) => update({ ...preferences, time: next })}
              labelId="pref-time"
              textClass="text-[15px] leading-[20px]"
            />
            <div className="flex h-[48px] w-full items-center justify-between gap-[8px] border-b border-atlas-beige font-manrope text-[14px] leading-[19px]">
              <p className="text-atlas-ink">Starting</p>
              <p aria-live="polite" className="font-semibold text-atlas-teal">
                Now · back by {clock(DAY_START + hoursOf(time) * 60)}
              </p>
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col items-start gap-[10px]">
          <h2 className={SECTION_TITLE}>What are you curious about?</h2>
          <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">Pick as many as you like.</p>
          <div className="flex w-full flex-wrap items-start gap-[8px]">
            {INTERESTS.map((interest) => {
              const selected = interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleInterest(interest)}
                  className={`flex h-[44px] items-center justify-center rounded-[22px] border px-[16px] font-manrope text-[14px] font-semibold leading-[19px] ${
                    selected ? "border-atlas-teal bg-atlas-teal text-atlas-paper" : "border-atlas-beige bg-atlas-paper text-atlas-teal"
                  }`}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex w-full flex-col items-start gap-[10px]">
          <h2 id="pref-price" className={SECTION_TITLE}>
            Price level
          </h2>
          <Segmented
            name="price"
            options={PRICE_OPTIONS}
            value={price}
            onChange={(next) => update({ ...preferences, price: next })}
            labelId="pref-price"
            textClass="text-[13px] leading-[18px]"
          />
          <p className="w-full font-manrope text-[13px] leading-[1.5] text-atlas-slate">
            A general guide only. Places without a known price level can still appear.
          </p>
        </section>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-atlas-beige bg-atlas-paper">
        <div className="mx-auto flex h-[139px] w-full max-w-[640px] flex-col items-start gap-[6px] px-[16px] pb-[calc(20px+env(safe-area-inset-bottom))] pt-[12px] short:h-auto short:flex-row short:items-center short:pb-[calc(10px+env(safe-area-inset-bottom))] short:pt-[10px]">
          {editing ? (
            <>
              <AtlasButton onClick={save} className="short:flex-1">
                Save changes
              </AtlasButton>
              <AtlasTextLink to="Stay" className="short:w-auto short:px-[12px]">
                Cancel
              </AtlasTextLink>
            </>
          ) : (
            <>
              <AtlasButton to="PlanBuild" className="short:flex-1">
                Plan my time
              </AtlasButton>
              <AtlasTextLink to="Main" className="short:w-auto short:px-[12px]">
                Just show me places
              </AtlasTextLink>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
