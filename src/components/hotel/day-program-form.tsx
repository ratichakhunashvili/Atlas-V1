import { Button } from "@/components/shared/button";
import { Field } from "@/components/shared/field";
import { MAX_DAY_PROGRAM_STEP_PLACES, MAX_DAY_PROGRAM_STEPS } from "@/db/schema/hotel-day-program";

type Option = { id: string; name: string; note: string };

/**
 * The hotel's "Day program" editor. Plain HTML, no client script: one row per possible step, each with an order
 * number and up to three places chosen from a searchable list of THIS hotel's eligible catalogue (its own facilities
 * included). Leaving a row empty removes that step; changing the order numbers reorders the steps. The server
 * validates everything again (features/hotels/day-program.ts).
 */
export function DayProgramForm({
  action,
  options,
  steps,
}: {
  action: (formData: FormData) => void | Promise<void>;
  options: Option[];
  steps: { placeIds: string[] }[];
}) {
  const nameOf = new Map(options.map((option) => [option.id, option.name]));
  const listId = "day-program-places";

  return (
    <form action={action} className="space-y-4">
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {`${option.name} (${option.note})`}
          </option>
        ))}
      </datalist>
      {Array.from({ length: MAX_DAY_PROGRAM_STEPS }, (_, i) => {
        const placeIds = steps[i]?.placeIds ?? [];
        return (
          <fieldset key={i} className="space-y-2 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium">Step {i + 1}</legend>
            {placeIds.length > 0 && (
              <p className="text-xs text-slate-500">
                Now: {placeIds.map((id) => nameOf.get(id) ?? "a place guests can no longer see").join(" / ")}
              </p>
            )}
            <Field label="Order" name={`step${i}_order`} type="number" min={1} max={MAX_DAY_PROGRAM_STEPS} defaultValue={i + 1} />
            {Array.from({ length: MAX_DAY_PROGRAM_STEP_PLACES }, (_, j) => (
              <Field
                key={j}
                label={`Place ${j + 1}${j === 0 ? "" : " (optional)"}`}
                name={`step${i}_place${j}`}
                list={listId}
                defaultValue={placeIds[j] ?? ""}
                placeholder="Type to search places"
                autoComplete="off"
              />
            ))}
          </fieldset>
        );
      })}
      <Button type="submit">Save day program</Button>
    </form>
  );
}
