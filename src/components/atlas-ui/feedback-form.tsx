"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FeedbackFormState } from "@/features/feedback/actions";
import { FEEDBACK_COPY } from "@/features/feedback/copy";
import {
  FEEDBACK_SEGMENTS,
  NOTE_MAX_LENGTH,
  NOT_USED_LABEL,
  NOT_USED_VALUE,
  RATING_VALUES,
  RATING_WORDS,
  SEGMENT_HINTS,
  SEGMENT_LABELS,
  noteField,
  ratingField,
  type FeedbackSegment,
} from "@/features/feedback/segments";
import { firstInvalidField } from "@/features/feedback/validation";
import { ErrorBanner } from "./sign-in-form";
import { AtlasButton } from "./ui";

/*
 * Private feedback after a plan day (Phase 2). A plain form posted to a server action: each segment is a fieldset of
 * native radios (arrow keys move between them), 1–5 plus "Didn't use it" for every segment but Overall, and an
 * optional note with a character count. The browser's own validation is off so every error comes back from the
 * server, is announced (role=alert) and moves focus to the first field that needs another look.
 */

type Action = (state: FeedbackFormState, formData: FormData) => Promise<FeedbackFormState>;

const OPTION =
  "flex h-[48px] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[12px] border font-manrope text-[16px] font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-atlas-teal border-atlas-beige bg-atlas-paper text-atlas-teal has-[:checked]:border-atlas-teal has-[:checked]:bg-atlas-teal has-[:checked]:text-atlas-paper";
const NOT_USED =
  "flex h-[44px] w-full cursor-pointer items-center justify-center rounded-[12px] border font-manrope text-[14px] font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-atlas-teal border-atlas-beige bg-atlas-paper text-atlas-ink has-[:checked]:border-atlas-ink has-[:checked]:bg-atlas-ink has-[:checked]:text-atlas-paper";

function NoteField({ segment, initial, error }: { segment: FeedbackSegment; initial: string; error?: string }) {
  const [length, setLength] = useState(initial.length);
  const name = noteField(segment);
  const countId = `${name}-count`;
  const errorId = `${name}-error`;
  return (
    <div className="flex w-full flex-col items-start gap-[6px]">
      <label htmlFor={name} className="font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink">
        {FEEDBACK_COPY.noteLabel} <span className="font-normal text-atlas-slate">({FEEDBACK_COPY.noteOptional})</span>
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={initial}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId} ${countId}` : countId}
        onChange={(event) => setLength(event.currentTarget.value.length)}
        className="w-full resize-y rounded-[12px] border border-atlas-beige bg-atlas-paper px-[12px] py-[10px] font-manrope text-[16px] leading-[22px] text-atlas-ink outline-none focus-visible:border-atlas-teal focus-visible:outline-2 focus-visible:outline-atlas-teal aria-[invalid=true]:border-atlas-danger"
      />
      {error ? (
        <p id={errorId} className="font-manrope text-[13px] leading-[18px] text-atlas-danger">
          {error}
        </p>
      ) : null}
      <p id={countId} className="self-end font-manrope text-[12px] leading-[16px] text-atlas-slate">
        {FEEDBACK_COPY.charactersLeft(Math.max(0, NOTE_MAX_LENGTH - length))}
      </p>
    </div>
  );
}

function Segment({ segment, values, errors }: { segment: FeedbackSegment; values: Record<string, string>; errors: Record<string, string | undefined> }) {
  const name = ratingField(segment);
  const value = values[name] ?? "";
  const error = errors[name];
  const legendId = `${segment}-legend`;
  const hintId = `${segment}-hint`;
  const errorId = `${name}-error`;
  const required = segment === "overall";
  return (
    <section className="flex w-full flex-col items-start gap-[12px] rounded-[16px] border border-atlas-beige bg-atlas-paper p-[14px]">
      <fieldset
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        className="flex w-full min-w-0 flex-col items-start gap-[10px]"
      >
        <legend id={legendId} className="mb-[4px] font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">
          {SEGMENT_LABELS[segment]}
          {required ? <span className="font-manrope text-[13px] font-normal text-atlas-slate"> (required)</span> : null}
        </legend>
        <p id={hintId} className="font-manrope text-[13px] leading-[18px] text-atlas-slate">
          {SEGMENT_HINTS[segment]}
        </p>
        <div className="flex w-full items-start gap-[6px]">
          {RATING_VALUES.map((rating) => (
            <label key={rating} className={OPTION}>
              <input type="radio" name={name} value={String(rating)} defaultChecked={value === String(rating)} className="sr-only" />
              <span aria-hidden>{rating}</span>
              <span className="sr-only">
                {rating}, {RATING_WORDS[rating]}
              </span>
            </label>
          ))}
        </div>
        <div aria-hidden className="flex w-full justify-between font-manrope text-[12px] leading-[16px] text-atlas-slate">
          <span>1 · {RATING_WORDS[1]}</span>
          <span>5 · {RATING_WORDS[5]}</span>
        </div>
        {required ? null : (
          <label className={NOT_USED}>
            <input type="radio" name={name} value={NOT_USED_VALUE} defaultChecked={value === NOT_USED_VALUE} className="sr-only" />
            {NOT_USED_LABEL}
          </label>
        )}
        {error ? (
          <p id={errorId} className="font-manrope text-[13px] leading-[18px] text-atlas-danger">
            {error}
          </p>
        ) : null}
      </fieldset>
      <NoteField segment={segment} initial={values[noteField(segment)] ?? ""} error={errors[noteField(segment)]} />
    </section>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <AtlasButton type="submit" disabled={pending}>
      {pending ? FEEDBACK_COPY.submitting : FEEDBACK_COPY.submit}
    </AtlasButton>
  );
}

export function FeedbackForm({ dayId, action }: { dayId: string; action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  // After a refused submit: focus the first field that needs another look (the banner above announces the error).
  useEffect(() => {
    if (!state.fieldErrors) return;
    const field = firstInvalidField(state.fieldErrors);
    if (!field) return;
    const form = formRef.current;
    const target =
      form?.querySelector<HTMLInputElement>(`input[name="${field}"]:checked`) ??
      form?.querySelector<HTMLElement>(`[name="${field}"]`) ??
      null;
    target?.focus();
    target?.scrollIntoView({ block: "center" });
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex w-full flex-col items-start gap-[16px]" key={JSON.stringify(values)}>
      <input type="hidden" name="dayId" value={dayId} />
      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {FEEDBACK_SEGMENTS.map((segment) => (
        <Segment key={segment} segment={segment} values={values} errors={errors} />
      ))}
      <div className="w-full pt-[4px]">
        <Submit />
      </div>
    </form>
  );
}
