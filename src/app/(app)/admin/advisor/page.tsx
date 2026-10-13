import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { listAdvisorTestScenarios, SCENARIO_LABELS, type ScenarioType } from "@/services/advisor-testing/scenario";
import { CreateScenarioForm } from "./create-scenario-form";

export default async function AdvisorTestingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const scenarios = await listAdvisorTestScenarios();

  return (
    <div className="space-y-6">
      <Alert variant="error">
        ADVISOR TESTING / ADMIN — this area operates on the real database and real Advisor services. Creating or
        deleting a scenario here creates or deletes real rows (users, hotels, places, stays, itineraries). It is not
        the guest-facing product.
      </Alert>

      <h1 className="text-2xl font-semibold">Advisor Testing</h1>

      {error && <Alert>{decodeURIComponent(error)}</Alert>}

      <Card className="space-y-1 text-sm">
        <h2 className="font-medium">System status</h2>
        <p className="text-slate-500">
          Candidate engine, scoring, difficulty, routing, GPS check-in, and QR check-in are all exercised live by the
          scenario tools below — this isn&apos;t a self-reported health check, it calls the real services.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Create test scenario</h2>
        <CreateScenarioForm labels={SCENARIO_LABELS as Record<ScenarioType, string>} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Existing scenarios</h2>
        {scenarios.length === 0 ? (
          <EmptyState title="No test scenarios yet" description="Create one above to get started." />
        ) : (
          <ul className="space-y-2 text-sm">
            {scenarios.map((scenario) => (
              <li key={scenario.tag} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                <div>
                  <Link href={`/admin/advisor/${scenario.tag}`} className="font-medium text-slate-900 hover:underline">
                    {scenario.tag}
                  </Link>
                  <p className="text-xs text-slate-500">
                    Type {scenario.type} — {SCENARIO_LABELS[scenario.type]} — test user role: {scenario.role} — created{" "}
                    {scenario.createdAt.toISOString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
