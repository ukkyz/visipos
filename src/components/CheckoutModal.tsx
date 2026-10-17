"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { SaleReceipt } from "@/lib/types";

type Method = "cash" | "card" | "qris" | "ewallet";

const METHODS: { id: Method; label: string; icon: string; hint: string }[] = [
  { id: "cash", label: "Cash", icon: "💵", hint: "Enter tendered amount" },
  { id: "card", label: "Card", icon: "💳", hint: "Simulated terminal capture" },
  { id: "qris", label: "QRIS", icon: "🟪", hint: "Customer scans the QR" },
  { id: "ewallet", label: "E-wallet", icon: "📱", hint: "Wallet app approval" },
];

type Props = {
  totals: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number };
  itemCount: number;
  onClose: () => void;
  onComplete: (method: Method, paidCents: number) => Promise<SaleReceipt | null>;
  serverErrors: { sku: string; message: string }[];
};

export function CheckoutModal({ totals, itemCount, onClose, onComplete, serverErrors }: Props) {
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState<number>(totals.totalCents);
  const [processing, setProcessing] = useState(false);

  const change = Math.max(0, tendered - totals.totalCents);
  const canPay = method !== "cash" || tendered >= totals.totalCents;

  const press = (key: string) => {
    if (key === "del") {
      setTendered((prev) => Math.floor(prev / 10));
      return;
    }
    if (key === "clear") {
      setTendered(0);
      return;
    }
    setTendered((prev) => {
      const next = Number(`${prev}${key}`);
      return next > 99_999_999 ? prev : next;
    });
  };

  const submit = async () => {
    setProcessing(true);
    await onComplete(method, method === "cash" ? tendered : totals.totalCents);
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur">
      <div className="animate-pop-in w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Payment</h2>
            <p className="text-xs text-slate-400">
              {itemCount} item line{itemCount === 1 ? "" : "s"} · total charged after tax
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMethod(item.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    method === item.id
                      ? "border-emerald-400/50 bg-emerald-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="mt-1 block text-sm font-semibold text-white">{item.label}</span>
                  <span className="block text-[11px] text-slate-400">{item.hint}</span>
                </button>
              ))}
            </div>

            {method === "cash" ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Tendered cash</span>
                  <span className="font-mono text-sm text-emerald-300">{formatMoney(tendered)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => press(key)}
                      className="rounded-lg border border-white/10 bg-white/5 py-2 text-sm font-medium text-slate-100 hover:bg-white/10"
                    >
                      {key === "clear" ? "C" : key === "del" ? "⌫" : key}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTendered(totals.totalCents)}
                    className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200"
                  >
                    Exact {formatMoney(totals.totalCents)}
                  </button>
                  {[1000, 2000, 5000, 10000].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setTendered(totals.totalCents + step)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200"
                    >
                      +{formatMoney(step)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-4 text-xs text-sky-100">
                {method === "qris"
                  ? "A QR payload is generated for the customer app. Approve on the customer device to complete."
                  : method === "card"
                    ? "Insert/tap the card on the terminal. The POS will capture the approval automatically."
                    : "Wallet request sent. Waiting for the customer to approve in their app."}
              </div>
            )}

            {serverErrors.length ? (
              <ul className="space-y-1 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">
                {serverErrors.map((error) => (
                  <li key={`${error.sku}-${error.message}`}>⚠ {error.sku}: {error.message}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <Row label="Subtotal" value={formatMoney(totals.subtotalCents)} />
            {totals.discountCents ? (
              <Row label="Discount" value={`-${formatMoney(totals.discountCents)}`} tone="text-amber-300" />
            ) : null}
            <Row label="Tax" value={formatMoney(totals.taxCents)} />
            <div className="h-px bg-white/10" />
            <Row label="Total" value={formatMoney(totals.totalCents)} emphasis />
            <Row label="Tendered" value={formatMoney(method === "cash" ? tendered : totals.totalCents)} />
            <Row label="Change" value={formatMoney(method === "cash" ? change : 0)} tone="text-emerald-300" />

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canPay || processing}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "Processing payment…" : `Charge ${formatMoney(totals.totalCents)}`}
            </button>
            {!canPay ? (
              <p className="text-center text-[11px] text-rose-300">Cash tendered is less than the total.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "text-slate-100",
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${tone} ${emphasis ? "text-lg font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
