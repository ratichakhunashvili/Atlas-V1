"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import type { IssueCredentialResult, RevokeCredentialResult } from "@/features/qr-credentials/actions";

/**
 * Issue / rotate / revoke one subject's QR credential, with the one-time reveal.
 *
 * The raw token lives only in this component's state, for as long as the admin
 * leaves the page open. It is never part of the server-rendered payload, never
 * re-fetchable, and never stored anywhere but the printed code itself — the
 * database holds a hash. Navigating away loses it, which is the intended
 * behaviour: the replacement for a lost code is a new code.
 */
export function QrCredentialPanel({
  label,
  description,
  hasActiveCredential,
  issuedAt,
  issue,
  revoke,
}: {
  label: string;
  description: string;
  hasActiveCredential: boolean;
  issuedAt: Date | null;
  issue: () => Promise<IssueCredentialResult>;
  revoke: () => Promise<RevokeCredentialResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (operation: () => Promise<IssueCredentialResult | RevokeCredentialResult>) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if ("rawToken" in result) {
        setRevealed(result.rawToken);
        setNotice(
          result.replacedExisting
            ? "A new code was issued. The previous code stopped working immediately."
            : "Code issued."
        );
        return;
      }
      setRevealed(null);
      setNotice(result.revoked ? "Code revoked. It no longer works." : "There was no active code to revoke.");
    });
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-medium">{label}</h2>
        <p className="text-xs text-slate-500">{description}</p>
      </div>

      <p className="text-sm text-slate-700">
        {hasActiveCredential ? (
          <>
            Active{issuedAt ? ` — issued ${issuedAt.toISOString().slice(0, 10)}` : ""}. The code itself is stored only
            as a hash and cannot be shown again.
          </>
        ) : (
          "No active code. Issue one to print."
        )}
      </p>

      {error && <Alert variant="error">{error}</Alert>}
      {notice && !error && <Alert variant="success">{notice}</Alert>}

      {revealed && (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">
            Shown once. Copy it into your QR generator now — it cannot be retrieved later.
          </p>
          <code className="block break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-900">
            {revealed}
          </code>
          <Button type="button" variant="secondary" onClick={() => setRevealed(null)}>
            Done, hide it
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => run(issue)}>
          {hasActiveCredential ? "Issue new code (revokes current)" : "Issue code"}
        </Button>
        {hasActiveCredential && (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(revoke)}>
            Revoke
          </Button>
        )}
      </div>
    </Card>
  );
}
