import type { ReactNode } from "react";
import { RECEPTION_FALLBACK, type FrontDesk } from "@/features/legal/front-desk";

/*
 * The guest's way to reach their hotel. With a valid stay and a dialable hotel number it is a real `tel:` link
 * ("Call <hotel>"); otherwise it is one plain line and no button, so nothing on screen pretends to call.
 * See features/legal/front-desk.ts for when a number counts as dialable.
 */

export function FrontDeskCall({
  frontDesk,
  className,
  fallbackClassName,
  children,
}: {
  frontDesk: FrontDesk | null;
  className: string;
  fallbackClassName: string;
  /** Link content; defaults to "Call <hotel>". */
  children?: ReactNode;
}) {
  if (!frontDesk) return <p className={fallbackClassName}>{RECEPTION_FALLBACK}</p>;
  return (
    <a href={frontDesk.telHref} className={className} aria-label={`Call ${frontDesk.hotelName}, ${frontDesk.displayPhone}`}>
      {children ?? `Call ${frontDesk.hotelName}`}
    </a>
  );
}
