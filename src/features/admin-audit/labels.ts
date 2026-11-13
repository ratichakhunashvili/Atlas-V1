import type { AdminAuditAction } from "@/db/schema/admin-audit-events";

/**
 * A readable name for every audited action, for the admin audit log. A Record over the closed action list, so adding
 * an action without a label is a type error rather than a raw code on the screen.
 */
export const AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  "partnership.proposed": "Hotel partnership proposed",
  "partnership.confirmed": "Hotel partnership confirmed",
  "partnership.suspended": "Hotel partnership suspended",
  "partnership.revoked": "Hotel partnership revoked",
  "partnership.reopened": "Hotel partnership reopened",
  "partnership.promotion_changed": "Partnership promotion changed",
  "contract.proposed": "Atlas contract proposed",
  "contract.confirmed": "Atlas contract confirmed",
  "contract.suspended": "Atlas contract suspended",
  "contract.ended": "Atlas contract ended",
  "contract.reopened": "Atlas contract reopened",
  "place.kind_changed": "Place kind changed",
  "place.created": "Place created",
  "place.updated": "Place details edited",
  "place.published": "Place published",
  "place.unpublished": "Place unpublished",
  "place.verified": "Place verified",
  "place.unverified": "Place unverified",
  "place.archived": "Place archived",
  "place.unarchived": "Place unarchived",
  "place.deleted": "Place deleted",
  "hotel.created": "Hotel created",
  "hotel.updated": "Hotel's place changed",
  "facility.added": "Hotel facility added",
  "facility.deactivated": "Hotel facility deactivated",
  "facility.reactivated": "Hotel facility activated",
  "qr_credential.issued": "Hotel code issued",
  "qr_credential.rotated": "Hotel code replaced",
  "qr_credential.revoked": "Hotel code revoked",
  "model.saved": "3D model saved",
  "model.enabled": "3D model enabled",
  "model.disabled": "3D model disabled",
  "model.deleted": "3D model deleted",
  "staff.role_changed": "Staff role changed",
  "support.guest_lookup": "Guest looked up by support",
  "support.guest_moved": "Guest moved to another hotel",
};

/** The label for a stored action. Rows written before an action was renamed still show their raw code. */
export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_LABELS, action) ? AUDIT_ACTION_LABELS[action as AdminAuditAction] : action;
}
