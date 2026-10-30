"use client";

import { AVAILABLE_MINUTE_OPTIONS } from "@/services/advisor/time-budget";

/**
 * "Tell us when you're free." The whole product promise starts here, so it is a
 * row of plain radio buttons rather than anything clever: large tap targets,
 * readable at phone width, and operable from the keyboard with arrow keys
 * because it is a real radio group.
 *
 * The options are the ones the server plans for; a value outside them is refused
 * by the action, so this control cannot drift from what Atlas can actually do.
 */
export function FreeTimePicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="mt-3" disabled={disabled}>
      <legend className="text-sm font-medium text-slate-900">How much free time do you have?</legend>
      <p className="text-xs text-slate-500">
        We&apos;ll fit the walking, the time at each stop and the walk back into it.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {AVAILABLE_MINUTE_OPTIONS.map((minutes) => {
          const selected = value === minutes;
          return (
            <label
              key={minutes}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-900 ${
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="availableMinutes"
                value={minutes}
                checked={selected}
                onChange={() => onChange(minutes)}
                // Visually hidden, not removed: the radio stays focusable and
                // announced, so the control works with a keyboard and a screen reader.
                className="sr-only"
              />
              {formatWindow(minutes)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function formatWindow(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
