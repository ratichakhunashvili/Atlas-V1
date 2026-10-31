"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/shared/button";
import { StayDatesForm, type StayDatesView } from "./stay-dates-form";

const QrScannerModal = dynamic(
  () => import("@/components/qr/qr-scanner-modal").then((module) => module.QrScannerModal),
  { ssr: false }
);

type UpcomingEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
};

type GuestAppShellProps = {
  children: ReactNode;
  isAdmin: boolean;
  hotelName: string | null;
  checkIn: string | null;
  stayDates: StayDatesView | null;
  /** Real, server-derived stay reminders (e.g. departure approaching). Never invented. */
  reminders: { id: string; title: string; description: string }[];
  upcomingEvents: UpcomingEvent[];
};

type OpenPanel = "stay" | "notifications" | null;

export function GuestAppShell({
  children,
  isAdmin,
  hotelName,
  checkIn,
  stayDates,
  reminders,
  upcomingEvents,
}: GuestAppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // A ref, not state: it only has to survive until the route change lands, and setting state
  // from the effect below would cascade renders.
  const pendingAdvisorOpen = useRef(false);
  const isAdminRoute = pathname.startsWith("/admin");
  const isMapRoute = pathname === "/";

  useEffect(() => {
    const openQr = () => {
      setPanel(null);
      setScanError(null);
      setScannerOpen(true);
    };
    window.addEventListener("atlas:open-qr", openQr);
    return () => window.removeEventListener("atlas:open-qr", openQr);
  }, []);

  useEffect(() => {
    if (pathname !== "/" || !pendingAdvisorOpen.current) return;
    pendingAdvisorOpen.current = false;
    window.dispatchEvent(new Event("atlas:open-advisor"));
  }, [pathname]);

  if (isAdminRoute) return <div className="atlas-admin-shell">{children}</div>;

  function handleScannedCode(decodedText: string) {
    const token = extractHotelEntryToken(decodedText);
    setScannerOpen(false);
    if (!token) {
      setScanError("That code does not look like a hotel entry code. Try scanning again or enter it manually.");
      return;
    }
    router.push(`/checkin/${encodeURIComponent(token)}`);
  }

  function openAdvisor() {
    setPanel(null);
    if (!isMapRoute) {
      pendingAdvisorOpen.current = true;
      router.push("/");
      return;
    }
    window.dispatchEvent(new Event("atlas:open-advisor"));
  }

  const stayLabel = hotelName ? `Stay · ${hotelName}` : "Start your hotel stay";
  const activeSection = pathname === "/collection" ? "/collection" : pathname;

  return (
    <div className={`atlas-guest-shell${isMapRoute ? " atlas-guest-shell--map" : ""}`}>
      <a className="atlas-skip-link" href="#atlas-main-content">
        Skip to content
      </a>

      <header className="atlas-guest-topbar" aria-label="Stay controls">
        <button
          type="button"
          className="atlas-round-control"
          aria-label="Open notifications"
          aria-expanded={panel === "notifications"}
          onClick={() => setPanel((current) => (current === "notifications" ? null : "notifications"))}
        >
          <Icon name="bell" />
          {upcomingEvents.length > 0 && <span className="atlas-notification-dot" aria-label="Upcoming hotel events" />}
        </button>

        <button
          type="button"
          className="atlas-stay-chip"
          aria-label={hotelName ? `Stay at ${hotelName}` : "Start your hotel stay"}
          aria-expanded={panel === "stay"}
          onClick={() => setPanel((current) => (current === "stay" ? null : "stay"))}
        >
          <span className="atlas-stay-indicator" />
          <span className="atlas-stay-label">{stayLabel}</span>
          {checkIn && <span className="atlas-stay-date">· Since {formatShortDate(checkIn)}</span>}
          <Icon name="chevron" />
        </button>

        <button type="button" className="atlas-round-control" aria-label="Open Atlas Advisor" onClick={openAdvisor}>
          <Icon name="sparkle" />
        </button>

        {isAdmin && (
          <Link className="atlas-admin-shortcut" href="/admin">
            Admin
          </Link>
        )}
      </header>

      {panel && (
        <section
          className="atlas-top-panel"
          aria-labelledby="atlas-top-panel-title"
          aria-live="polite"
          key={panel}
        >
          <div className="atlas-panel-heading">
            <div>
              <p className="atlas-eyebrow">{panel === "stay" ? "Your stay" : "Updates from your hotel"}</p>
              <h2 id="atlas-top-panel-title">{panel === "stay" ? hotelName ?? "Start your stay" : "Notifications"}</h2>
            </div>
            <button className="atlas-panel-close" type="button" aria-label="Close panel" onClick={() => setPanel(null)}>
              <Icon name="close" />
            </button>
          </div>

          {panel === "stay" ? (
            <div className="atlas-panel-body">
              {hotelName ? (
                <>
                  <p className="atlas-panel-copy">
                    Recommendations come from this hotel&apos;s facilities and its approved local partners.
                  </p>
                  {checkIn && <p className="atlas-panel-meta">Checked in {formatDate(checkIn)}</p>}
                  {stayDates && <StayDatesForm stay={stayDates} />}
                  <Link className="atlas-panel-link" href="/experiences" onClick={() => setPanel(null)}>
                    Browse approved experiences <Icon name="arrow" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="atlas-panel-copy">Scan the QR code at reception to connect Atlas to your hotel.</p>
                  <Button type="button" onClick={() => window.dispatchEvent(new Event("atlas:open-qr"))}>
                    Scan hotel QR
                  </Button>
                </>
              )}
            </div>
          ) : upcomingEvents.length > 0 || reminders.length > 0 ? (
            <ul className="atlas-notification-list">
              {reminders.map((reminder) => (
                <li key={reminder.id}>
                  <span className="atlas-notification-icon" aria-hidden="true">
                    <Icon name="calendar" />
                  </span>
                  <div>
                    <p className="atlas-notification-title">{reminder.title}</p>
                    <p className="atlas-notification-copy">{reminder.description}</p>
                  </div>
                </li>
              ))}
              {upcomingEvents.map((event) => (
                <li key={event.id}>
                  <span className="atlas-notification-icon" aria-hidden="true">
                    <Icon name="calendar" />
                  </span>
                  <div>
                    <p className="atlas-notification-title">{event.title}</p>
                    <p className="atlas-notification-copy">{event.description || "A hotel event is coming up."}</p>
                    <time className="atlas-panel-meta" dateTime={event.startsAt}>
                      {formatDateTime(event.startsAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="atlas-panel-copy">Nothing new right now. Hotel events and stay updates will appear here.</p>
          )}
        </section>
      )}

      {scanError && (
        <div className="atlas-scan-error" role="alert">
          <span>{scanError}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setScanError(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}

      <main
        id="atlas-main-content"
        className={`atlas-guest-main${isMapRoute ? " atlas-guest-main--map" : " atlas-guest-main--page"}`}
      >
        {children}
      </main>

      <nav className="atlas-bottom-nav" aria-label="Main navigation">
        <Link className={`atlas-nav-item${activeSection === "/" ? " is-active" : ""}`} href="/" aria-current={activeSection === "/" ? "page" : undefined}>
          <Icon name="compass" />
          <span>Map</span>
        </Link>
        <button type="button" className="atlas-nav-item" onClick={openAdvisor}>
          <Icon name="medal" />
          <span>Mission</span>
        </button>
        <button
          type="button"
          className="atlas-nav-scan"
          aria-label="Scan a hotel entry QR code"
          onClick={() => {
            setPanel(null);
            setScanError(null);
            setScannerOpen(true);
          }}
        >
          <Icon name="qr" />
          <span className="sr-only">Scan QR code</span>
        </button>
        <Link
          className={`atlas-nav-item${activeSection === "/profile" ? " is-active" : ""}`}
          href="/profile"
          aria-current={activeSection === "/profile" ? "page" : undefined}
        >
          <Icon name="person" />
          <span>Profile</span>
        </Link>
      </nav>

      {scannerOpen && (
        <QrScannerModal
          title={hotelName ? "Scan a hotel QR code" : "Scan your hotel's QR code"}
          description={hotelName ? "Scan a hotel entry code to start or switch your stay." : "Scan the QR code at your hotel to start your stay."}
          onClose={() => setScannerOpen(false)}
          onScan={handleScannedCode}
        />
      )}
    </div>
  );
}

export function GuestStartButton({ children }: { children: ReactNode }) {
  return (
    <button type="button" className="atlas-primary-action" onClick={() => window.dispatchEvent(new Event("atlas:open-qr"))}>
      {children}
    </button>
  );
}

function extractHotelEntryToken(decodedText: string): string | null {
  const raw = decodedText.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/checkin\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return raw;
  }
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Icon({ name }: { name: "bell" | "sparkle" | "chevron" | "close" | "calendar" | "arrow" | "compass" | "qr" | "person" | "medal" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "bell":
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
    case "sparkle":
      return <svg {...common}><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /><path d="M8 14h2M14 14h2M8 17h2" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
    case "compass":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 5.2-5.2 2.2 2.2-5.2 5.2-2.2Z" /></svg>;
    case "qr":
      return <svg {...common}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" /><path d="M14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2h-2z" /></svg>;
    case "person":
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.3 3.1-5 7-5s6.3 1.7 7 5" /></svg>;
    case "medal":
      return <svg {...common}><circle cx="12" cy="8" r="5" /><path d="m8.5 12-1 9 4.5-2.5 4.5 2.5-1-9" /><path d="m10 8 1.3 1.3L14.5 6" /></svg>;
  }
}
