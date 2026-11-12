import type { Metadata } from "next";
import { AllowLocationButton } from "@/components/atlas-ui/allow-location-button";
import { PermissionScreen } from "@/components/atlas-ui/permission-screen";
import { LOCATION_SENT_WHEN } from "@/features/legal/copy";

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
          LOCATION_SENT_WHEN,
          "Without it, walk times are measured from Hotel A.",
        ]}
        allowLabel="Allow location"
        allowTo="Preferences"
        allowAction={<AllowLocationButton label="Allow location" next="Preferences" />}
        declineLabel="Not now"
        declineTo="Preferences"
        footnote="You can change this later in Stay."
      />
    </main>
  );
}
