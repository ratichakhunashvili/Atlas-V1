import { NextResponse, type NextRequest } from "next/server";

/*
 * Short hotel-entry link printed in new QR codes (lib/qr-links.ts): /C/<token> forwards to /checkin/<token>, which
 * does all the checking. This route reads nothing and writes nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/checkin/${encodeURIComponent(token)}`, request.url), 307);
}
