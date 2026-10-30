/*
 * Status · … pills from the admin tables. The word is always printed, so the state never relies
 * on colour alone; the colours are the design's.
 */

export type AdminStatus =
  | "Active"
  | "Inactive"
  | "Verified"
  | "Published"
  | "Draft"
  | "Revoked"
  | "Expired"
  | "Hotel entry"
  | "Place check-in";

const TONES: Record<AdminStatus, string> = {
  Active: "bg-atlas-teal text-atlas-paper",
  Verified: "bg-atlas-teal text-atlas-paper",
  Published: "bg-atlas-teal text-atlas-paper",
  Inactive: "bg-atlas-sand text-atlas-slate",
  Draft: "bg-atlas-sand text-atlas-slate",
  Expired: "bg-atlas-beige text-atlas-ink",
  // #f4e0db is the design's Revoked fill; it is not one of the palette tokens.
  Revoked: "bg-[#f4e0db] text-atlas-danger",
  "Hotel entry": "bg-atlas-sand text-atlas-teal",
  "Place check-in": "bg-atlas-sand text-atlas-teal",
};

export function StatusPill({ status }: { status: AdminStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[12px] px-[10px] py-[3px] font-manrope text-[12px] font-semibold leading-[16px] ${TONES[status]}`}
    >
      {status}
    </span>
  );
}
