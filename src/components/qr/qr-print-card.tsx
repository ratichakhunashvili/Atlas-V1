"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/shared/button";

/**
 * A scannable, printable picture of a freshly issued code. The image is drawn in the browser from the one-time
 * token, so the token never travels anywhere else. High error correction keeps a scuffed or partly covered
 * print readable.
 */
export function QrPrintCard({ value, title }: { value: string; title: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { errorCorrectionLevel: "H", margin: 4, width: 1024 })
      .then((url) => !cancelled && setImage(url))
      .catch(() => !cancelled && setError("Couldn't draw the QR image. Copy the code below into a QR generator instead."));
    return () => {
      cancelled = true;
    };
  }, [value]);

  function print() {
    if (!image) return;
    const win = window.open("", "_blank", "width=600,height=700");
    if (!win) {
      setError("Your browser blocked the print window. Allow pop-ups for this page, or use Download PNG.");
      return;
    }
    const doc = win.document;
    doc.title = title;
    const img = doc.createElement("img");
    img.src = image;
    img.alt = title;
    img.style.cssText = "width:80mm;height:80mm;display:block;margin:20mm auto 6mm";
    const caption = doc.createElement("p");
    caption.textContent = title;
    caption.style.cssText = "text-align:center;font:600 16px system-ui,sans-serif";
    doc.body.append(img, caption);
    img.onload = () => {
      win.focus();
      win.print();
    };
  }

  if (error) return <p className="text-xs text-red-700">{error}</p>;
  if (!image) return <p className="text-xs text-slate-500">Drawing the QR image…</p>;

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimise */}
      <img src={image} alt={`QR code: ${title}`} width={220} height={220} className="rounded border border-slate-200 bg-white" />
      <div className="flex flex-wrap gap-2">
        <a
          href={image}
          download={`${title.replace(/[^\w-]+/g, "-").toLowerCase()}.png`}
          className="inline-flex items-center rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800"
        >
          Download PNG
        </a>
        <Button type="button" variant="secondary" onClick={print}>
          Print
        </Button>
      </div>
    </div>
  );
}
