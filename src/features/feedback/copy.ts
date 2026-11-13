/*
 * Guest wording for private feedback after a plan day (Phase 2). Friendly and short. Kept here, away from the
 * components, so features/feedback/copy.test.ts can check it: never contracts, commission or approval, and no
 * suggestion that guests see each other's feedback (only the Atlas team reads it).
 */
export const FEEDBACK_COPY = {
  title: "How was your day?",
  intro: "Tell us how your plan went before you plan again. Only the Atlas team reads this. It helps us fix what went wrong.",
  dayLine: (hotelName: string, date: string) => `Your plan from ${hotelName} on ${date}`,
  moreAfter: (count: number) => (count === 1 ? "One more day to go after this one." : `${count} more days to go after this one.`),
  noteLabel: "What went wrong?",
  noteOptional: "Optional",
  charactersLeft: (left: number) => (left === 1 ? "1 character left" : `${left} characters left`),
  submit: "Send feedback",
  submitting: "Sending…",
  fixErrors: "Some answers need another look.",
  thanksTitle: "Thank you!",
  thanksText: "Your feedback is with the Atlas team.",
  thanksNext: "Thanks! There's another day to tell us about.",
  /** Leads to /plan, which offers a new plan when today has none yet. */
  planAgain: "Go to my plan",
  nothingTitle: "Nothing to tell us about right now",
  nothingText: "When a plan day ends, we'll ask how it went.",
  backToPlan: "Back to my plan",
} as const;
