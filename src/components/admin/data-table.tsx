import type { ReactNode } from "react";
import { AtlasLink } from "@/components/atlas-ui/ui";
import type { ScreenKey } from "@/components/atlas-ui/screen-hrefs";

/*
 * The one admin table (Hotels, Places, Hotel partners, Facilities, QR codes, Achievements).
 *
 * A real <table>: column headers are <th scope="col">, and each row's first cell is its
 * <th scope="row">, so a screen reader announces "Hotel B, City, Batumi". Column widths are the
 * Figma ones; the last column takes what is left. When the page is narrower than the columns,
 * the table scrolls inside its own rounded container instead of pushing the page sideways. The
 * container is positioned so the sr-only labels (absolutely positioned) are clipped with it.
 */

export type AdminColumn = {
  label: string;
  /** Figma column width in px. Omit on the trailing action column. */
  width?: number;
  /** Header text for screen readers only, for the unlabelled action column. */
  hidden?: boolean;
};

const EDGE = 16;
const ACTION_MIN = 100;

export function AdminTable({
  caption,
  columns,
  rows,
}: {
  /** Names the table for assistive technology; not drawn, the page title already says it. */
  caption: string;
  columns: readonly AdminColumn[];
  /** One entry per row: [key, cells]. The first cell is the row header. */
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
}) {
  const minWidth = columns.reduce((sum, column) => sum + (column.width ?? ACTION_MIN), EDGE * 2);
  return (
    <div className="relative w-full overflow-x-auto rounded-[14px] border border-atlas-beige bg-white">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-atlas-sand">
          <tr className="h-[44px]">
            {columns.map((column, index) => (
              <th
                key={column.label}
                scope="col"
                className="p-0 align-middle font-manrope text-[12px] font-semibold uppercase leading-[16px] tracking-[0.72px] text-atlas-slate first:pl-[16px] last:pr-[16px]"
                style={column.width ? { width: column.width + (index === 0 ? EDGE : 0) } : undefined}
              >
                {column.hidden ? <span className="sr-only">{column.label}</span> : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="h-[56px] border-b border-atlas-beige last:border-b-0">
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th
                    key={index}
                    scope="row"
                    className="whitespace-nowrap py-0 pl-[16px] pr-[12px] align-middle font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={index}
                    className="whitespace-nowrap py-0 pr-[12px] align-middle font-manrope text-[14px] leading-[19px] text-atlas-ink last:pr-[16px]"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A value the design prints in Slate: "Not set", "—". */
export function MutedCell({ children }: { children: ReactNode }) {
  return <span className="text-atlas-slate">{children}</span>;
}

/** Edit ⇒ …Form / Revoke ⇒ AdminQRRevoke. `label` says which row, since every row reads "Edit". */
export function RowAction({ to, label, children }: { to: ScreenKey; label: string; children: ReactNode }) {
  return (
    <AtlasLink to={to} label={label} className="atlas-hit inline-flex items-center font-semibold text-atlas-teal">
      {children}
    </AtlasLink>
  );
}
