import { NextResponse, type NextRequest } from "next/server";

/*
 * Short place check-in link printed in new QR codes (lib/qr-links.ts): /U/<token> forwards to /unlock/<token>, which
 * does all the checking. This route reads nothing and writes nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/unlock/${encodeURIComponent(token)}`, request.url), 307);
}
