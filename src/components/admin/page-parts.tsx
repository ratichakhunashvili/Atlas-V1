import type { ReactNode } from "react";
import { AtlasIcon } from "@/components/atlas-ui/asset";
import { AtlasLink } from "@/components/atlas-ui/ui";
import type { ScreenKey } from "@/components/atlas-ui/screen-hrefs";

/*
 * Pieces every admin page shares: the page header (title, one-line description, optional
 * action), the info notes, the "Sample data for the prototype." line and the 44px header action.
 */

export function AdminPageHeader({
  title,
  description,
  action,
  form = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  /** Form frames draw a 100px header with the title centred in it. */
  form?: boolean;
}) {
  return (
    <header
      className={`flex w-full flex-wrap items-center justify-between gap-x-[24px] gap-y-[12px] ${form ? "lg:min-h-[100px]" : ""}`}
    >
      <div className="flex min-w-0 flex-col items-start gap-[4px]">
        <h1 className="font-grotesk text-[26px] font-bold leading-[33px] text-atlas-teal">{title}</h1>
        <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">{description}</p>
      </div>
      {action}
    </header>
  );
}

/** Button · New hotel, Create code, Done… — the 44px action beside a page title. */
export function AdminHeaderAction({ to, children }: { to: ScreenKey; children: ReactNode }) {
  return (
    <AtlasLink
      to={to}
      className="flex h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-[12px] bg-atlas-teal px-[18px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-paper"
    >
      {children}
    </AtlasLink>
  );
}

/** Note with icon/info: a rule the admin should know, in Slate. */
export function AdminNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-[8px]">
      <AtlasIcon src="/atlas-ui/icon-info-slate-16.svg" size={16} className="mt-[1.5px] shrink-0" />
      <p className="min-w-0 flex-1 font-manrope text-[13px] leading-[1.45] text-atlas-slate">{children}</p>
    </div>
  );
}

export function SampleDataNote() {
  return <p className="font-manrope text-[12px] leading-[16px] text-atlas-slate">Sample data for the prototype.</p>;
}
