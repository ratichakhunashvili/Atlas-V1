"use client";

import { useEffect, useRef, type ReactNode } from "react";

/*
 * Confirmation sheet — the design's bottom-sheet dialogs (RepairConfirm 1:1423, PrivacyDelete
 * 1:1357). Built on the native <dialog> opened with showModal(), so the browser moves focus into
 * it, keeps it there, makes the page behind it inert, closes it on Escape, and returns focus to
 * whatever opened it. Focus starts on the sheet itself, not on its destructive action. On phones
 * it is a sheet on the bottom edge, as drawn; in the wide layout it is a centred card.
 */
export function AtlasDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first button; start on the sheet so the destructive action is not pre-selected.
      sheet.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop (the dialog element itself, outside its content) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        // Native modal dialogs let Tab leave for the browser's own controls; keep it cycling inside.
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === sheet.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="m-0 mt-auto max-h-[100dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] bg-atlas-paper p-0 text-atlas-ink wide:m-auto wide:max-w-[440px] wide:rounded-[24px]"
    >
      <div
        ref={sheet}
        tabIndex={-1}
        className="flex flex-col items-start gap-[12px] px-[20px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[24px] outline-none"
      >
        {children}
      </div>
    </dialog>
  );
}
