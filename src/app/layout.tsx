import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "VisiPOS — camera-driven point of sale",
  description:
    "Point of sale with camera based product detection, visual catalog enrollment, stock control and cashier checkout.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh text-slate-100 antialiased">
        <TopNav />
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-5 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
