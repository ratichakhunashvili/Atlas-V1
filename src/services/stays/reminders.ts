/**
 * Stay reminders, derived only from data the guest declared. No push delivery is implied: these are shown in the
 * notification panel when the guest opens it, and nowhere else.
 */
export type StayReminder = { id: string; title: string; description: string };

const MS_PER_DAY = 86_400_000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function stayReminders(input: { expectedCheckOut: Date | null; now: Date }): StayReminder[] {
  if (!input.expectedCheckOut) return [];

  const daysLeft = Math.round((startOfUtcDay(input.expectedCheckOut) - startOfUtcDay(input.now)) / MS_PER_DAY);
  if (daysLeft === 0) {
    return [
      {
        id: "departure-today",
        title: "Your last day",
        description: "Today is the departure date you declared. Plans for later days won't be made.",
      },
    ];
  }
  if (daysLeft === 1) {
    return [{ id: "departure-tomorrow", title: "One day left", description: "Tomorrow is the last day of the stay you declared." }];
  }
  return [];
}
