/**
 * What the guest's plan says when there is nothing more to choose today. Pure, so the wording rule is tested:
 * "your day is done" only when the guest actually did something. With nothing done, Atlas says plainly that nothing
 * fits and invites the guest to try other interests (CLAUDE.md: never substitute, never pretend). Today's time window
 * is fixed once the day starts, but the options are drawn from the saved interests each time, so changing them helps.
 */
export type FinishedReason = "limit" | "no_time" | "nothing_left";

export type FinishedCopy = {
  title: string;
  text: string;
  /** Offer the link to change interests. */
  offerPreferences: boolean;
};

export function finishedCopy(reason: FinishedReason, completedCount: number): FinishedCopy {
  if (reason === "limit") {
    return { title: "Your day is done", text: "That's your four activities for today. New options tomorrow.", offerPreferences: false };
  }
  if (completedCount === 0) {
    return {
      title: "Nothing fits right now",
      text:
        reason === "no_time"
          ? "Nothing fits the time you have, including the walk back to your hotel. Try other interests to see shorter options."
          : "Nothing near your hotel matches your interests right now. Try other interests to see more options.",
      offerPreferences: true,
    };
  }
  if (reason === "no_time") {
    return {
      title: "Your day is done",
      text: "Nothing else fits the time you have left, including the walk back. Enjoy the rest of your day.",
      offerPreferences: false,
    };
  }
  return {
    title: "Your day is done",
    text: "You've done everything that fits your interests today. Try other interests to see more.",
    offerPreferences: true,
  };
}
