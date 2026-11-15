"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FeedbackFormState } from "@/features/feedback/actions";
import { FEEDBACK_COPY } from "@/features/feedback/copy";
import { COMMENT_MAX_LENGTH, FEEDBACK_TOPICS, TOPIC_LABELS } from "@/features/feedback/segments";
import { firstInvalidField } from "@/features/feedback/validation";
import { ErrorBanner } from "./sign-in-form";
import { AtlasButton } from "./ui";

/*
 * Private feedback after a plan day: pick what it is about from a dropdown, write a comment, send (owner decision,
 * 2026-11-15). A plain form posted to a server action. The browser's own validation is off so every error comes back
 * from the server, is announced (role=alert) and moves focus to the first field that needs another look.
 */

type Action = (state: FeedbackFormState, formData: FormData) => Promise<FeedbackFormState>;

const FIELD =
  "w-full rounded-[12px] border border-atlas-beige bg-atlas-paper px-[12px] font-manrope text-[16px] leading-[22px] text-atlas-ink outline-none focus-visible:border-atlas-teal focus-visible:outline-2 focus-visible:outline-atlas-teal aria-[invalid=true]:border-atlas-danger";
const LABEL = "font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink";
const ERROR = "font-manrope text-[13px] leading-[18px] text-atlas-danger";

/** The comment box and its character count. Remounts with the form (keyed by the echoed values) after a refused submit. */
function CommentField({ initial, error }: { initial: string; error?: string }) {
  const [length, setLength] = useState(initial.length);
  return (
    <div className="flex w-full flex-col items-start gap-[6px]">
      <label htmlFor="comment" className={LABEL}>
        {FEEDBACK_COPY.commentLabel}
      </label>
      <textarea
        id="comment"
        name="comment"
        defaultValue={initial}
        maxLength={COMMENT_MAX_LENGTH}
        rows={6}
        placeholder={FEEDBACK_COPY.commentPlaceholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "comment-error comment-count" : "comment-count"}
        onChange={(event) => setLength(event.currentTarget.value.length)}
        className={`${FIELD} resize-y py-[10px]`}
      />
      {error ? (
        <p id="comment-error" className={ERROR}>
          {error}
        </p>
      ) : null}
      <p id="comment-count" className="self-end font-manrope text-[12px] leading-[16px] text-atlas-slate">
        {FEEDBACK_COPY.charactersLeft(Math.max(0, COMMENT_MAX_LENGTH - length))}
      </p>
    </div>
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
    const target = field ? formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`) : null;
    target?.focus();
    target?.scrollIntoView({ block: "center" });
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex w-full flex-col items-start gap-[16px]" key={JSON.stringify(values)}>
      <input type="hidden" name="dayId" value={dayId} />
      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <div className="flex w-full flex-col items-start gap-[6px]">
        <label htmlFor="topic" className={LABEL}>
          {FEEDBACK_COPY.topicLabel}
        </label>
        <select
          id="topic"
          name="topic"
          defaultValue={values.topic ?? ""}
          aria-invalid={errors.topic ? true : undefined}
          aria-describedby={errors.topic ? "topic-error" : undefined}
          className={`${FIELD} h-[48px]`}
        >
          <option value="" disabled>
            {FEEDBACK_COPY.topicPlaceholder}
          </option>
          {FEEDBACK_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {TOPIC_LABELS[topic]}
            </option>
          ))}
        </select>
        {errors.topic ? (
          <p id="topic-error" className={ERROR}>
            {errors.topic}
          </p>
        ) : null}
      </div>

      <CommentField initial={values.comment ?? ""} error={errors.comment} />

      <div className="w-full pt-[4px]">
        <Submit />
      </div>
    </form>
  );
}
