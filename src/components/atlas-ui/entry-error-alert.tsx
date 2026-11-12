import Link from "next/link";

/*
 * Why a scanned or typed hotel code was refused, shown to a guest who already has a stay (the map, or the step before
 * planning). The text is always one of the fixed sentences from features/hotel-stays/entry-errors.ts, never words from
 * the URL. Floats over the map at the top on phones and wide screens; "Dismiss" goes back to the plain home address,
 * which also drops the query so a reload does not show it again.
 */
export function EntryErrorAlert({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-[12px] pt-[calc(12px+env(safe-area-inset-top))]">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-[480px] items-start gap-[10px] rounded-[14px] border border-atlas-danger bg-atlas-danger-soft py-[10px] pl-[14px] pr-[6px] shadow-[0px_6px_18px_0px_rgba(28,41,41,0.16)]"
      >
        <p className="min-w-0 flex-1 py-[2px] font-manrope text-[14px] leading-[1.45] text-atlas-danger">{message}</p>
        <Link
          href="/"
          aria-label="Dismiss this message"
          className="flex h-[44px] shrink-0 items-center justify-center rounded-[10px] px-[10px] font-manrope text-[14px] font-semibold text-atlas-danger underline"
        >
          Dismiss
        </Link>
      </div>
    </div>
  );
}
