export const DEMO_STEP_COUNT = 6;

export function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Step {step} of {DEMO_STEP_COUNT}
      </p>
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={DEMO_STEP_COUNT}
        aria-valuenow={step}
        aria-label={`Step ${step} of ${DEMO_STEP_COUNT}`}
      >
        {Array.from({ length: DEMO_STEP_COUNT }, (_, index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-slate-900" : "bg-slate-200"}`} />
        ))}
      </div>
      <h1 className="pt-2 text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}
