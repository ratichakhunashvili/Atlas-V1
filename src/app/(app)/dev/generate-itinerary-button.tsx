"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/button";
import { generateItineraryAction } from "@/features/advisor/actions";

export function GenerateDevItineraryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function generate() {
    startTransition(async () => {
      const result = await generateItineraryAction();
      setMessage(
        result.ok
          ? result.regenerated
            ? `Itinerary generated or updated with ${result.itinerary.stops.length} stops.`
            : `Existing itinerary loaded with ${result.itinerary.stops.length} stops.`
          : `${result.reason}: ${result.message}`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" disabled={pending} onClick={generate}>
        {pending ? "Generating…" : "Generate itinerary explicitly"}
      </Button>
      {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}
