import QRCode from "qrcode";

/*
 * Atlas-branded QR code as an SVG string: Deep Teal modules and corner squares on warm white, with the bronze
 * discovery star in a cleared centre. Pure (no DOM), so the admin page and the printable seed sheet draw the same
 * picture and a test can decode it.
 *
 * The centre is cleared on purpose: the code uses error correction Q (about 25% recoverable) and the cleared square
 * stays under 10% of the grid, so every code still scans. Q rather than H, with the short upper-case link
 * (lib/qr-links.ts), keeps the grid at 33x33 (owner decision, 2026-11-15).
 */

export const QR_COLORS = { ink: "#0a4a4f", paper: "#f6f3ec", star: "#c17d57" } as const;

/** Share of the code's width (data area, without the quiet zone) cleared for the star. */
const CENTER_SHARE = 0.24;
const QUIET_ZONE = 4;

/** A four-point star with curved sides and a small curved-diamond window, centred on (0,0), radius 1. */
function starPath(cx: number, cy: number, r: number): string {
  const point = (x: number, y: number) => `${(cx + x * r).toFixed(3)},${(cy + y * r).toFixed(3)}`;
  const shape = (s: number, k: number) =>
    `M${point(0, -s)}Q${point(k, -k)} ${point(s, 0)}Q${point(k, k)} ${point(0, s)}Q${point(-k, k)} ${point(-s, 0)}Q${point(-k, -k)} ${point(0, -s)}Z`;
  return shape(1, 0.14) + shape(0.36, 0.06);
}

function isFinderCell(row: number, col: number, size: number): boolean {
  const inBox = (r0: number, c0: number) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
  return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
}

/** The code's grid size and the cleared centre square, in modules (exported for tests). */
export function brandedQrLayout(value: string, errorCorrectionLevel: "H" | "Q" = "Q") {
  const qr = QRCode.create(value, { errorCorrectionLevel });
  const size = qr.modules.size;
  // Cleared centre, in whole modules and centred.
  let hole = Math.round(size * CENTER_SHARE);
  if (hole % 2 !== size % 2) hole += 1;
  return { qr, size, hole, errorCorrection: qr.errorCorrectionLevel };
}

export function brandedQrSvg(value: string, errorCorrectionLevel: "H" | "Q" = "Q"): string {
  const { qr, size, hole } = brandedQrLayout(value, errorCorrectionLevel);
  const data = qr.modules.data;
  const full = size + QUIET_ZONE * 2;
  const holeStart = (size - hole) / 2;
  const inHole = (row: number, col: number) =>
    row >= holeStart && row < holeStart + hole && col >= holeStart && col < holeStart + hole;

  let modules = "";
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!data[row * size + col] || isFinderCell(row, col, size) || inHole(row, col)) continue;
      modules += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }

  // Corner squares: a solid outer ring and a solid centre, the template's teal blocks.
  const finder = (r0: number, c0: number) => {
    const x = c0 + QUIET_ZONE;
    const y = r0 + QUIET_ZONE;
    return `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  };
  const finders = finder(0, 0) + finder(0, size - 7) + finder(size - 7, 0);

  const c = full / 2;
  const starRadius = hole * 0.42;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges">`,
    `<defs><radialGradient id="atlas-qr-glow"><stop offset="0" stop-color="${QR_COLORS.star}" stop-opacity="0.22"/><stop offset="1" stop-color="${QR_COLORS.star}" stop-opacity="0"/></radialGradient></defs>`,
    `<rect width="${full}" height="${full}" fill="${QR_COLORS.paper}"/>`,
    `<path fill="${QR_COLORS.ink}" d="${modules}"/>`,
    `<path fill="${QR_COLORS.ink}" fill-rule="evenodd" d="${finders}"/>`,
    `<circle cx="${c}" cy="${c}" r="${(hole / 2).toFixed(3)}" fill="url(#atlas-qr-glow)"/>`,
    `<path fill="${QR_COLORS.star}" fill-rule="evenodd" shape-rendering="geometricPrecision" d="${starPath(c, c, starRadius)}"/>`,
    `</svg>`,
  ].join("");
}
