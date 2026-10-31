import type { Metadata } from "next";
import { PermissionScreen } from "@/components/atlas-ui/permission-screen";

/* PermLocation · Location permission — Figma frame 1:810. */

export const metadata: Metadata = { title: "Location permission" };

export default function LocationPermissionPage() {
  return (
    <main>
      <PermissionScreen
        back="SignIn"
        icon="/atlas-ui/icon-pin-light-32.svg"
        title="Allow location for walk times and check-ins"
        body="Atlas uses your location to show how far places are and to confirm you are there when you check in."
        reassurances={[
          "Only while Atlas is open.",
          "Your location is sent only at the moment you check in.",
          "Without it, walk times are measured from Hotel A.",
        ]}
        allowLabel="Allow location"
        allowTo="Preferences"
        declineLabel="Not now"
        declineTo="Preferences"
        footnote="You can change this later in Stay."
      />
    </main>
  );
}
