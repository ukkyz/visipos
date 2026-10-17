"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Cashier", icon: "🧾", hint: "Camera checkout" },
  { href: "/catalog", label: "Catalog", icon: "📦", hint: "Products & stock" },
  { href: "/catalog/new", label: "Add with camera", icon: "📷", hint: "Enroll by photo" },
  { href: "/reports", label: "Reports", icon: "📈", hint: "Sales & detection" },
];

export function TopNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 text-lg shadow-lg shadow-emerald-500/25">
            🛰️
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-wide text-white">VisiPOS</span>
            <span className="block text-[11px] text-slate-400">camera → detect → checkout</span>
          </span>
        </Link>

        <nav className="ml-auto flex flex-wrap items-center gap-1.5">
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.hint}
                className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  active
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span aria-hidden>{link.icon}</span>
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
