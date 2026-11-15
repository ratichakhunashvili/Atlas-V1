"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { QrPrintCard } from "@/components/qr/qr-print-card";
import { qrLink, type QrLinkKind } from "@/lib/qr-links";
import type { IssueCredentialResult, RevealCredentialResult, RevokeCredentialResult } from "@/features/qr-credentials/actions";

/**
 * One subject's permanent QR code (services/qr/permanent.ts): show and download it any time, create it once, and
 * replace or revoke it only in an emergency (both stop the printed code).
 *
 * The code itself only ever arrives as the return value of an action the admin pressed, and lives in this
 * component's state while the page is open. It is never part of the server-rendered page.
 */
export function QrCredentialPanel({
  label,
  description,
  hasActiveCredential,
  issuedAt,
  linkKind,
  issue,
  reveal,
  revoke,
}: {
  label: string;
  description: string;
  hasActiveCredential: boolean;
  issuedAt: Date | null;
  /** When set, the QR image holds this site's short link (lib/qr-links.ts), so a phone's own camera app opens Atlas. */
  linkKind?: QrLinkKind;
  issue: () => Promise<IssueCredentialResult>;
  reveal: () => Promise<RevealCredentialResult>;
  revoke: () => Promise<RevokeCredentialResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (operation: () => Promise<IssueCredentialResult | RevealCredentialResult | RevokeCredentialResult>) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) {
        setError(result.error);
        setLegacy("legacy" in result && result.legacy === true);
        return;
      }
      setLegacy(false);
      if ("rawToken" in result) {
        setRevealed(result.rawToken);
        if ("replacedExisting" in result) {
          setNotice(result.replacedExisting ? "A new code was made. The previous printed code stopped working." : "Code created. It stays the same from now on.");
        }
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
        {hasActiveCredential
          ? `Active${issuedAt ? ` since ${issuedAt.toISOString().slice(0, 10)}` : ""}. This code stays the same; show it to download or print it again.`
          : "No code yet. Create one to print."}
      </p>

      {error && <Alert variant="error">{error}</Alert>}
      {notice && !error && <Alert variant="success">{notice}</Alert>}

      {revealed && (
        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
          <QrPrintCard value={linkKind ? qrLink(window.location.origin, linkKind, revealed) : revealed} title={label} />
          <code className="block break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-900">{revealed}</code>
          <Button type="button" variant="secondary" onClick={() => setRevealed(null)}>
            Hide
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {hasActiveCredential ? (
          <Button type="button" disabled={pending} onClick={() => run(reveal)}>
            Show code
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={() => run(issue)}>
            Create code
          </Button>
        )}
        {hasActiveCredential && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              // Replacing changes the code, so the printed one stops working: only for a lost, stolen or misused code.
              const question = legacy
                ? "Make a permanent code? The code printed now stops working and must be reprinted."
                : "Replace this code? Only do this if it was stolen or misused: the printed code stops working immediately.";
              if (!window.confirm(question)) return;
              run(issue);
            }}
          >
            {legacy ? "Make a permanent code" : "Replace code"}
          </Button>
        )}
        {hasActiveCredential && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Revoke this code? The printed code stops working immediately.")) return;
              run(revoke);
            }}
          >
            Revoke
          </Button>
        )}
      </div>
    </Card>
  );
}
