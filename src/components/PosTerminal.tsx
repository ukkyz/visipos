"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraScanner, type ScanCapture } from "@/components/CameraScanner";
import { CheckoutModal } from "@/components/CheckoutModal";
import { ReceiptModal } from "@/components/ReceiptModal";
import { feedbackBeep } from "@/lib/camera";
import { computeTotals, formatMoney, formatPercent } from "@/lib/money";
import { updatePrefs, usePrefs } from "@/lib/prefs";
import type { CartLine, DetectResponse, ProductDTO, SaleReceipt } from "@/lib/types";

const CONFIRM_WINDOW_MS = 4200;
const SKU_COOLDOWN_MS = 6500;

type ScanLogEntry = {
  id: string;
  at: number;
  name: string;
  sku: string;
  confidence: number;
  accepted: boolean;
  source: string;
  reason?: string;
};

type Toast = { id: string; tone: "ok" | "warn" | "error"; text: string };

export function PosTerminal({
  initialProducts,
  todayStats,
}: {
  initialProducts: ProductDTO[];
  todayStats: { saleCount: number; revenueCents: number; unitsSold: number };
}) {
  const prefs = usePrefs();
  const [products, setProducts] = useState<ProductDTO[]>(initialProducts);
  const [cart, setCart] = useState<CartLine[]>([]);
  const threshold = prefs.threshold;
  const cashier = prefs.cashier;
  const [discountCents, setDiscountCents] = useState(0);
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [serverErrors, setServerErrors] = useState<{ sku: string; message: string }[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const pendingRef = useRef<{ sku: string; at: number } | null>(null);
  const cooldownRef = useRef<Record<string, number>>({});
  const cartRef = useRef<CartLine[]>([]);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((entry) => entry.id !== id)), 2600);
  }, []);

  const pushLog = useCallback((entry: Omit<ScanLogEntry, "id" | "at">) => {
    setLogs((prev) => [{ ...entry, id: Math.random().toString(36).slice(2), at: Date.now() }, ...prev].slice(0, 12));
  }, []);

  const addToCart = useCallback(
    (product: ProductDTO, source: CartLine["matchSource"], confidence: number) => {
      const existing = cartRef.current.find((line) => line.productId === product.id);
      if (existing && existing.quantity >= product.stock) {
        toast(`${product.name} — only ${product.stock} in stock`, "warn");
        return false;
      }
      setCart((prev) => {
        const found = prev.find((line) => line.productId === product.id);
        if (found) {
          return prev.map((line) =>
            line.productId === product.id
              ? { ...line, quantity: line.quantity + 1, confidence: Math.max(line.confidence, confidence) }
              : line,
          );
        }
        return [
          ...prev,
          {
            key: `${product.id}-${Date.now()}`,
            productId: product.id,
            sku: product.sku,
            name: product.name,
            unitPriceCents: product.priceCents,
            quantity: 1,
            stock: product.stock,
            matchSource: source,
            confidence,
            imageData: product.imageData,
          },
        ];
      });
      return true;
    },
    [toast],
  );

  const handleDetect = useCallback(
    (response: DetectResponse, capture: ScanCapture) => {
      void capture;
      if (paused) return;
      const match = response.match;

      if (!match) {
        pendingRef.current = null;
        const runner = response.runnersUp[0];
        setHint(
          runner
            ? `Closest candidate ${runner.product.sku} at ${formatPercent(runner.confidence)} — below threshold`
            : null,
        );
        if (runner) {
          pushLog({
            name: runner.product.name,
            sku: runner.product.sku,
            confidence: runner.confidence,
            accepted: false,
            source: "vision",
            reason: "below threshold",
          });
        }
        return;
      }

      const now = Date.now();
      const sku = match.product.sku;
      const cooldownUntil = cooldownRef.current[sku] ?? 0;
      if (now < cooldownUntil) {
        setHint(`${match.product.name} already added — waiting ${Math.ceil((cooldownUntil - now) / 1000)}s`);
        return;
      }

      const pending = pendingRef.current;
      if (pending && pending.sku === sku && now - pending.at < CONFIRM_WINDOW_MS) {
        const added = addToCart(match.product, match.source === "barcode" ? "barcode" : "vision", match.confidence);
        pendingRef.current = null;
        cooldownRef.current[sku] = now + SKU_COOLDOWN_MS;
        feedbackBeep(added ? "detected" : "error");
        pushLog({
          name: match.product.name,
          sku,
          confidence: match.confidence,
          accepted: added,
          source: match.source,
        });
        if (added) {
          toast(`Added ${match.product.name} · ${formatPercent(match.confidence)} match`);
          setHint(null);
        }
      } else {
        pendingRef.current = { sku, at: now };
        setHint(`Detected ${match.product.name} (${formatPercent(match.confidence)}) — hold steady to confirm`);
      }
    },
    [addToCart, paused, pushLog, toast],
  );

  const totals = useMemo(() => computeTotals(cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0), discountCents), [cart, discountCents]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const changeQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) return line;
          const next = Math.max(0, Math.min(line.stock, line.quantity + delta));
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const refreshProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const data = (await response.json()) as { products: ProductDTO[] };
      setProducts(data.products);
    } catch {
      /* keep current list */
    }
  }, []);

  const completeSale = async (method: string, paidCents: number): Promise<SaleReceipt | null> => {
    setServerErrors([]);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            matchSource: line.matchSource,
            confidence: Math.round(line.confidence * 100),
          })),
          paymentMethod: method,
          paidCents,
          discountCents,
          cashier,
        }),
      });
      const data = (await response.json()) as
        | { ok: true; receipt: SaleReceipt }
        | { ok: false; errors?: { sku: string; message: string }[]; message?: string };

      if (!response.ok || !data.ok) {
        const errors = "errors" in data && data.errors ? data.errors : [{ sku: "cart", message: ("message" in data && data.message) || "Checkout failed" }];
        setServerErrors(errors);
        toast("Checkout blocked — review stock", "error");
        await refreshProducts();
        return null;
      }

      setReceipt(data.receipt);
      setCheckoutOpen(false);
      setCart([]);
      setDiscountCents(0);
      toast(`Sale ${data.receipt.sale.saleNumber} paid`);
      await refreshProducts();
      return data.receipt;
    } catch {
      toast("Network error during checkout", "error");
      return null;
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? products.filter(
          (product) =>
            product.name.toLowerCase().includes(needle) ||
            product.sku.toLowerCase().includes(needle) ||
            (product.barcode ?? "").includes(needle),
        )
      : products;
    return list.slice(0, 24);
  }, [products, query]);

  const visionUnits = cart
    .filter((line) => line.matchSource === "vision" || line.matchSource === "barcode")
    .reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Sales today" value={String(todayStats.saleCount)} icon="🧾" />
          <Stat label="Revenue today" value={formatMoney(todayStats.revenueCents)} icon="💰" />
          <Stat label="Units sold" value={String(todayStats.unitsSold)} icon="📦" />
          <Stat label="Camera units in cart" value={String(visionUnits)} icon="📷" accent />
        </div>

        <CameraScanner
          mode="pos"
          threshold={threshold}
          onThresholdChange={(value) => updatePrefs({ threshold: value })}
          onDetect={handleDetect}
          autoLoop={!paused}
          heightClass="h-[380px] sm:h-[460px]"
        />

        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
          <button
            type="button"
            onClick={() => setPaused((prev) => !prev)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium ${
              paused
                ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {paused ? "▶ Resume detection" : "⏸ Pause detection"}
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Cashier
            <input
              value={cashier}
              onChange={(event) => updatePrefs({ cashier: event.target.value })}
              className="w-32 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-400/60"
            />
          </label>
          {hint ? <span className="text-[11px] text-sky-200">{hint}</span> : null}
          <span className="ml-auto text-[11px] text-slate-400">
            Strategy: 2 consecutive frames + {SKU_COOLDOWN_MS / 1000}s per-SKU cooldown (prevents double scans)
          </span>
        </div>

        {logs.length ? (
          <div className="glass rounded-2xl p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Live detection log
            </h3>
            <ul className="space-y-1.5">
              {logs.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 text-[11px]">
                  <span className={entry.accepted ? "text-emerald-300" : "text-amber-300"}>
                    {entry.accepted ? "● added" : "○ skipped"}
                  </span>
                  <span className="text-slate-300">{entry.name}</span>
                  <span className="font-mono text-slate-500">{entry.sku}</span>
                  <span className="font-mono text-slate-400">{formatPercent(entry.confidence)}</span>
                  <span className="text-slate-500">{entry.source}</span>
                  {entry.reason ? <span className="text-amber-300/80">{entry.reason}</span> : null}
                  <span className="ml-auto text-slate-600">{new Date(entry.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Cart</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
              {itemCount} unit{itemCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Cart is empty. Show a product to the camera — detected items land here automatically.
              </p>
            ) : (
              cart.map((line) => (
                <div
                  key={line.key}
                  className="animate-pop-in flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2"
                >
                  {line.imageData ? (
                    <img src={line.imageData} alt={line.name} className="h-11 w-11 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-800">📦</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{line.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {line.sku} · {formatMoney(line.unitPriceCents)} ·{" "}
                      <span className={line.matchSource === "manual" ? "text-slate-400" : "text-emerald-300"}>
                        {line.matchSource === "manual" ? "manual" : `${line.matchSource} ${formatPercent(line.confidence)}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeQuantity(line.productId, -1)}
                      className="h-7 w-7 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/10"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-mono text-sm">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQuantity(line.productId, 1)}
                      className="h-7 w-7 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right font-mono text-sm text-emerald-300">
                    {formatMoney(line.unitPriceCents * line.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCart((prev) => prev.filter((item) => item.productId !== line.productId))}
                    className="text-xs text-rose-300/80 hover:text-rose-200"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono text-slate-200">{formatMoney(totals.subtotalCents)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Discount</span>
              <span className="flex items-center gap-1">
                <span className="text-slate-500">$</span>
                <input
                  value={(discountCents / 100).toFixed(2)}
                  onChange={(event) => setDiscountCents(Math.max(0, Math.round(Number(event.target.value || 0) * 100)))}
                  className="w-16 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-right font-mono text-xs text-white outline-none focus:border-emerald-400/60"
                />
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tax (8%)</span>
              <span className="font-mono text-slate-200">{formatMoney(totals.taxCents)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-slate-300">Total</span>
              <span className="font-mono text-2xl font-semibold text-white">{formatMoney(totals.totalCents)}</span>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setCart([])}
              disabled={!cart.length}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setServerErrors([]);
                setCheckoutOpen(true);
              }}
              disabled={!cart.length}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Charge {formatMoney(totals.totalCents)}
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Manual add</h3>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, SKU or barcode"
              className="w-48 rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400/60"
            />
          </div>
          <div className="grid max-h-[260px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filtered.length === 0 ? (
              <p className="col-span-full py-6 text-center text-xs text-slate-500">
                No products found. Enroll items from the catalog first.
              </p>
            ) : (
              filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    const added = addToCart(product, "manual", 0);
                    if (added) toast(`Added ${product.name} (manual)`);
                  }}
                  disabled={product.stock <= 0}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:border-emerald-400/40 hover:bg-emerald-400/10 disabled:opacity-40"
                >
                  {product.imageData ? (
                    <img src={product.imageData} alt={product.name} className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800">📦</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-white">{product.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      {product.sku} · stock {product.stock}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-emerald-300">{formatMoney(product.priceCents)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {checkoutOpen ? (
        <CheckoutModal
          totals={totals}
          itemCount={itemCount}
          serverErrors={serverErrors}
          onClose={() => setCheckoutOpen(false)}
          onComplete={(method, paidCents) => completeSale(method, paidCents)}
        />
      ) : null}

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}

      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((entry) => (
          <div
            key={entry.id}
            className={`animate-pop-in rounded-xl border px-4 py-2 text-xs font-medium shadow-xl backdrop-blur ${
              entry.tone === "ok"
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100"
                : entry.tone === "warn"
                  ? "border-amber-400/40 bg-amber-500/20 text-amber-100"
                  : "border-rose-400/40 bg-rose-500/20 text-rose-100"
            }`}
          >
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`glass rounded-2xl px-4 py-3 ${accent ? "border-emerald-400/30 bg-emerald-400/5" : ""}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        <span aria-hidden className="mr-1">{icon}</span>
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
