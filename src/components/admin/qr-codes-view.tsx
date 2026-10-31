import { AdminTable, MutedCell, RowAction } from "./data-table";
import { ADMIN_QR_CODES } from "./fixtures";
import { AdminHeaderAction, AdminNote, AdminPageHeader, SampleDataNote } from "./page-parts";
import { StatusPill } from "./status-pill";

/*
 * AdminQR's content (70:1549), shared with AdminQRRevoke (70:1796), which draws the same list
 * under its dialog. Only active codes can be revoked; the others show a dash.
 */
export function QrCodesView() {
  return (
    <>
      <AdminPageHeader
        title="QR codes"
        description="Codes guests scan to join a hotel or to check in at a place."
        action={<AdminHeaderAction to="AdminQRCreate">Create code</AdminHeaderAction>}
      />
      <AdminTable
        caption="QR codes"
        columns={[
          { label: "Label", width: 200 },
          { label: "Purpose", width: 130 },
          { label: "Target", width: 150 },
          { label: "Expires", width: 110 },
          { label: "Status", width: 110 },
          { label: "Actions", hidden: true },
        ]}
        rows={ADMIN_QR_CODES.map((code) => ({
          key: code.label,
          cells: [
            code.label,
            <StatusPill key="purpose" status={code.purpose} />,
            code.target,
            code.expires,
            <StatusPill key="status" status={code.status} />,
            code.status === "Active" ? (
              <RowAction to="AdminQRRevoke" label={`Revoke ${code.label}`}>
                Revoke
              </RowAction>
            ) : (
              <MutedCell>—</MutedCell>
            ),
          ],
        }))}
      />
      <AdminNote>
        {"Atlas stores only a hash of each code, so a code can't be shown again after you leave the page. To replace a code, revoke it and create a new one."}
      </AdminNote>
      <AdminNote>{"A hotel code can't be used to check in at a place, and a place code can't be used to join a hotel."}</AdminNote>
      <SampleDataNote />
    </>
  );
}
