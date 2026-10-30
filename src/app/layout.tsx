import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Atlas brand faces (docs/atlas-brand-book.md), used by the screens in src/components/atlas-ui.
const spaceGrotesk = Space_Grotesk({ variable: "--font-atlas-grotesk", subsets: ["latin"], display: "swap" });
const manrope = Manrope({ variable: "--font-atlas-manrope", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Atlas",
  description: "Atlas — a hotel-anchored local experience platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
