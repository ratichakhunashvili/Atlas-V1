"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { locationService } from "@/services/location";
import { screenHref, type ScreenKey } from "./screen-hrefs";
import { AtlasButton } from "./ui";

/*
 * "Allow location" on the location-permission step. It really asks the browser (from the tap, where every browser
 * shows its prompt), waits for the guest's answer, then continues either way: Atlas works without location, and the
 * answer is the browser's to keep. The map then reuses the same shared location service, so the live dot is there
 * the moment the guest reaches it.
 */
export function AllowLocationButton({ label, next }: { label: string; next: ScreenKey }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  async function allow() {
    setAsking(true);
    await locationService.requestPermission();
    router.push(screenHref(next) ?? "/");
  }

  return (
    <AtlasButton onClick={allow} disabled={asking}>
      {asking ? "Waiting for your answer…" : label}
    </AtlasButton>
  );
}
