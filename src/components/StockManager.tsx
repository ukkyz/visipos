"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CameraScanner, type ScanCapture } from "@/components/CameraScanner";
import { centsToInputValue, formatDateTime, formatMoney, parsePriceToCents } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";
import type { FingerprintView, MovementView, ProductSaleView, ScanView } from "@/server/products";

const REASONS = [
  { id: "restock", label: "Restock / delivery" },
  { id: "adjustment", label: "Manual adjustment" },
  { id: "damage", label: "Damage / write-off" },
  { id: "audit", label: "Stock count audit" },
  { id: "return", label: "Customer return" },
];

type Props = {
  product: ProductDTO;
  movements: MovementView[];
  fingerprints: FingerprintView[];
  recentSales: ProductSaleView[];
  recentScans: ScanView[];
  created: boolean;
  conflict: boolean;
};

export function StockManager({
  product: initialProduct,
  movements,
  fingerprints,
  recentSales,
  recentScans,
  created,
  conflict,
}: Props) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [price, setPrice] = useState(centsToInputValue(initialProduct.priceCents));
  const [cost, setCost] = useState(centsToInputValue(initialProduct.costCents));
  const [threshold, setThreshold] = useState(String(initialProduct.lowStockThreshold));
  const [name, setName] = useState(initialProduct.name);
  const [category, setCategory] = useState(initialProduct.category);
  const [barcode, setBarcode] = useState(initialProduct.barcode ?? "");
  const [stockInput, setStockInput] = useState(String(initialProduct.stock));
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showEnroll, setShowEnroll] = useState(false);
  const [newCaptures, setNewCaptures] = useState<{ label: string; thumbnail: string; descriptor: unknown }[]>([]);

  const patch = async (body: Record<string, unknown>, successText: string) => {
    setBusy(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.sku)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const message = data?.errors
          ? Object.values(data.errors as Record<string, string>).join(" · ")
          : (data?.message ?? "Update failed");
        setFlash({ tone: "error", text: message });
        return false;
      }
      const updated = data.product as ProductDTO;
      setProduct(updated);
      setStockInput(String(updated.stock));
      setPrice(centsToInputValue(updated.priceCents));
      setCost(centsToInputValue(updated.costCents));
      setThreshold(String(updated.lowStockThreshold));
      setFlash({ tone: "ok", text: successText });
      router.refresh();
      return true;
    } catch {
      setFlash({ tone: "error", text: "Network error while saving" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const adjustStock = (delta: number) =>
    patch({ stockDelta: delta, reason, note: note || undefined }, `Stock ${delta > 0 ? "+" : ""}${delta} recorded (${reason}).`);

  const setStockExact = () => {
    const value = Math.max(0, Number(stockInput) || 0);
    return patch(
      { stockAbsolute: value, reason, note: note || `Counted ${value}` },
      `Stock set to ${value} units.`,
    );
  };

  const saveDetails = () =>
    patch(
      {
        name,
        category,
        price,
        costCents: parsePriceToCents(cost),
        lowStockThreshold: Number(threshold) || 0,
        barcode,
      },
      "Product details updated.",
    );

  const enroll = (capture: ScanCapture) => {
    setNewCaptures((prev) =>
      prev.length >= 3
        ? prev
        : [
            ...prev,
            {
              label: `angle-${fingerprints.length + prev.length + 1}`,
              thumbnail: capture.thumbnail,
              descriptor: capture.descriptor,
            },
          ],
    );
  };

  const saveAngle = async () => {
    if (!newCaptures.length) {
      setFlash({ tone: "error", text: "Capture at least one camera frame first" });
      return;
    }
    setBusy(true);
    try {
      for (const capture of newCaptures) {
        await fetch(`/api/products/${encodeURIComponent(product.sku)}/fingerprints`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: capture.label,
            enrollment: { descriptor: capture.descriptor, thumbnail: capture.thumbnail },
          }),
        });
      }
      setNewCaptures([]);
      setShowEnroll(false);
      setFlash({ tone: "ok", text: "New detection angles enrolled — camera matching is stronger now." });
      router.refresh();
    } catch {
      setFlash({ tone: "error", text: "Could not enroll the new angles" });
    } finally {
      setBusy(false);
    }
  };

  const low = product.stock <= product.lowStockThreshold;

  return (
    <div className="space-y-5">
      {created ? (
        <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100">
          ✅ Product created and automatically enrolled for camera detection. It is already available at the cashier
          terminal.
        </p>
      ) : null}
      {conflict ? (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
          ℹ️ SKU <span className="font-mono">{product.sku}</span> already existed in the catalog, so the add-product
          flow handed you to the stock update page instead of creating a duplicate.
        </p>
      ) : null}

      <div className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4">
        {product.imageData ? (
          <img src={product.imageData} alt={product.name} className="h-24 w-24 rounded-2xl object-cover" />
        ) : (
          <span className="grid h-24 w-24 place-items-center rounded-2xl bg-slate-800 text-3xl">📦</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-white">{product.name}</h1>
          <p className="font-mono text-xs text-slate-400">
            {product.sku} · {product.category} {product.barcode ? `· ${product.barcode}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
              price {formatMoney(product.priceCents)}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 ${
                product.stock <= 0
                  ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                  : low
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              stock {product.stock}
            </span>
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-sky-200">
              {fingerprints.length} visual fingerprint{fingerprints.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
              updated {formatDateTime(product.updatedAt)}
            </span>
          </div>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-200 hover:bg-white/10"
        >
          Go to terminal →
        </Link>
      </div>

      {flash ? (
        <p
          className={`rounded-xl border px-4 py-2 text-xs ${
            flash.tone === "ok"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/40 bg-rose-500/10 text-rose-100"
          }`}
        >
          {flash.text}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="glass space-y-4 rounded-2xl p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Stock update</h2>
            <p className="text-[11px] text-slate-400">
              Every change writes a movement record so the inventory trail stays auditable.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[-10, -1, 1, 10].map((delta) => (
              <button
                key={delta}
                type="button"
                disabled={busy}
                onClick={() => void adjustStock(delta)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/10 disabled:opacity-40"
              >
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400">current {product.stock}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Reason</span>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
              >
                {REASONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Note</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Supplier PO #1234"
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                Set counted stock
              </span>
              <input
                value={stockInput}
                inputMode="numeric"
                onChange={(event) => setStockInput(event.target.value.replace(/[^0-9]/g, ""))}
                className="w-28 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStockExact()}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              Save stock count
            </button>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Movement history
            </h3>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {movements.length === 0 ? (
                <p className="text-[11px] text-slate-500">No movements recorded yet.</p>
              ) : (
                movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px]"
                  >
                    <span
                      className={`font-mono ${
                        movement.delta < 0 ? "text-rose-300" : movement.delta > 0 ? "text-emerald-300" : "text-slate-400"
                      }`}
                    >
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </span>
                    <span className="text-slate-300">{movement.reason}</span>
                    {movement.note ? <span className="truncate text-slate-500">{movement.note}</span> : null}
                    <span className="ml-auto font-mono text-slate-400">→ {movement.resultingStock}</span>
                    <span className="w-24 text-right text-slate-600">{formatDateTime(movement.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="glass space-y-4 rounded-2xl p-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Pricing &amp; details</h2>
              <p className="text-[11px] text-slate-400">Updates apply instantly to the cashier terminal.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Category</span>
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Price ($)</span>
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Cost ($)</span>
                <input
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                  Low stock alert
                </span>
                <input
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Barcode</span>
                <input
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDetails()}
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              Save product details
            </button>
          </div>

          <div className="glass space-y-3 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Camera enrollment</h2>
                <p className="text-[11px] text-slate-400">
                  {fingerprints.length} fingerprint(s) power camera recognition for this SKU.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEnroll((prev) => !prev)}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/10"
              >
                {showEnroll ? "Hide camera" : "+ Add angle"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {fingerprints.length === 0 ? (
                <p className="text-[11px] text-rose-300">
                  No fingerprints — the camera cannot detect this product. Add at least one angle.
                </p>
              ) : (
                fingerprints.map((fingerprint) => (
                  <div key={fingerprint.id} className="relative">
                    {fingerprint.thumbnail ? (
                      <img
                        src={fingerprint.thumbnail}
                        alt={fingerprint.label}
                        className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="grid h-16 w-16 place-items-center rounded-lg bg-slate-800 text-xs">
                        print
                      </span>
                    )}
                    <span className="absolute -bottom-1 left-0.5 rounded bg-slate-950/85 px-1 text-[10px] text-slate-300">
                      {fingerprint.label}
                    </span>
                  </div>
                ))
              )}
            </div>

            {showEnroll ? (
              <div className="space-y-3">
                <CameraScanner
                  mode="enroll"
                  autoLoop
                  probe
                  intervalMs={2400}
                  heightClass="h-56"
                  onCapture={enroll}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {newCaptures.map((capture, index) => (
                    <img
                      key={`${capture.label}-${index}`}
                      src={capture.thumbnail}
                      alt={capture.label}
                      className="h-14 w-14 rounded-lg border border-emerald-400/40 object-cover"
                    />
                  ))}
                  <button
                    type="button"
                    disabled={busy || !newCaptures.length}
                    onClick={() => void saveAngle()}
                    className="ml-auto rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-semibold text-slate-950 disabled:opacity-40"
                  >
                    Save {newCaptures.length || ""} angle(s) to detection
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Recent sales of this SKU</h2>
          {recentSales.length === 0 ? (
            <p className="text-[11px] text-slate-500">Not sold yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentSales.map((sale) => (
                <li
                  key={`${sale.saleNumber}-${sale.createdAt}`}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px]"
                >
                  <span className="font-mono text-slate-300">{sale.saleNumber}</span>
                  <span className="text-slate-400">×{sale.quantity}</span>
                  <span className="text-emerald-300">{formatMoney(sale.lineTotalCents)}</span>
                  <span className="text-slate-400">
                    {sale.matchSource === "manual" ? "manual" : `${sale.matchSource} ${sale.confidence}%`}
                  </span>
                  <span className="ml-auto text-slate-600">{formatDateTime(sale.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Camera detections</h2>
          {recentScans.length === 0 ? (
            <p className="text-[11px] text-slate-500">No camera frames matched this SKU yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentScans.map((scan) => (
                <li
                  key={scan.id}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px]"
                >
                  <span className={scan.accepted ? "text-emerald-300" : "text-amber-300"}>
                    {scan.accepted ? "match" : "candidate"}
                  </span>
                  <span className="text-slate-300">{scan.source}</span>
                  <span className="font-mono text-slate-400">confidence {scan.confidence}%</span>
                  <span className="font-mono text-slate-500">distance {scan.distance}%</span>
                  <span className="text-slate-500">{scan.context}</span>
                  <span className="ml-auto text-slate-600">{formatDateTime(scan.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
