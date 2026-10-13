"use client";

import { useTransition } from "react";
import { Button } from "@/components/shared/button";
import { Select } from "@/components/shared/select";
import { createAdvisorTestScenarioAction } from "@/features/advisor-testing/actions";

export function CreateScenarioForm({ labels }: { labels: Record<string, string> }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        const type = String(formData.get("type") ?? "A");
        const role = String(formData.get("role") ?? "user");
        startTransition(() => createAdvisorTestScenarioAction(type, role));
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="min-w-[20rem]">
        <Select label="Scenario type" name="type" defaultValue="A">
          {Object.entries(labels).map(([type, label]) => (
            <option key={type} value={type}>
              {type} — {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-[12rem]">
        <Select label="Test user role" name="role" defaultValue="user">
          <option value="user">user (cooldown applies)</option>
          <option value="admin">admin (bypasses cooldown — existing Advisor behavior)</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create Test Scenario"}
      </Button>
    </form>
  );
}
