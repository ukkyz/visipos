"use client";

import { formatDateTime, formatMoney } from "@/lib/money";
import type { SaleReceipt } from "@/lib/types";

export function ReceiptModal({ receipt, onClose }: { receipt: SaleReceipt; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur">
      <div className="animate-pop-in w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Payment received</h2>
            <p className="text-xs text-emerald-300">{receipt.sale.saleNumber}</p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-200">
            {receipt.sale.paymentMethod.toUpperCase()} · paid
          </span>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 font-mono text-xs">
          <p className="text-center text-[11px] text-slate-400">
            VisiPOS demo store · {formatDateTime(receipt.sale.createdAt)} · cashier {receipt.sale.cashier}
          </p>
          <div className="space-y-2">
            {receipt.items.map((item, index) => (
              <div key={`${item.sku}-${index}`}>
                <div className="flex justify-between text-slate-200">
                  <span className="truncate">{item.name}</span>
                  <span>{formatMoney(item.lineTotalCents)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>
                    {item.sku} · {item.quantity} × {formatMoney(item.unitPriceCents)}
                  </span>
                  <span>
                    {item.matchSource === "manual"
                      ? "manual"
                      : `${item.matchSource} ${item.confidence}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="h-px bg-white/10" />
          <Line label="Subtotal" value={formatMoney(receipt.sale.subtotalCents)} />
          {receipt.sale.discountCents ? (
            <Line label="Discount" value={`-${formatMoney(receipt.sale.discountCents)}`} />
          ) : null}
          <Line label="Tax" value={formatMoney(receipt.sale.taxCents)} />
          <Line label="Total" value={formatMoney(receipt.sale.totalCents)} strong />
          <Line label="Paid" value={formatMoney(receipt.sale.paidCents)} />
          <Line label="Change" value={formatMoney(receipt.sale.changeCents)} />
          <p className="pt-2 text-center text-[11px] text-slate-500">
            {receipt.items.filter((item) => item.matchSource === "vision").length} line(s) added by camera
            detection
          </p>
        </div>

        <div className="flex gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-slate-300">
      <span>{label}</span>
      <span className={strong ? "text-base font-semibold text-white" : ""}>{value}</span>
    </div>
  );
}
