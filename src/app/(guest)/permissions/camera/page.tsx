import type { Metadata } from "next";
import { PermissionScreen } from "@/components/atlas-ui/permission-screen";

/* PermCamera · Camera permission — Figma frame 1:841. */

export const metadata: Metadata = { title: "Camera permission" };

export default function CameraPermissionPage() {
  return (
    <main>
      <PermissionScreen
        back="Detail"
        icon="/atlas-ui/icon-camera-light-32.svg"
        title="Use your camera to check in"
        body="Scan the Atlas code at partner places, or use the camera view at attractions to unlock achievements."
        reassurances={[
          "The camera is only on while you are scanning.",
          "Nothing is photographed, saved or uploaded.",
          "You can always check in with your location instead.",
        ]}
        allowLabel="Allow camera"
        allowTo="Scan"
        declineLabel="Not now, use my location"
        declineTo="Unlocked"
        footnote="Your phone will ask you to confirm."
      />
    </main>
  );
}
