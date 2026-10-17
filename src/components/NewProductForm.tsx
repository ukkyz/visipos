"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraScanner, type ScanCapture } from "@/components/CameraScanner";
import { formatMoney, parsePriceToCents } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";
import type { ProductDescriptor } from "@/lib/vision";

type Capture = {
  descriptor: ProductDescriptor;
  thumbnail: string;
  label: string;
};

const CATEGORIES = [
  "Beverages",
  "Snacks",
  "Pantry",
  "Personal Care",
  "Household",
  "Stationery",
  "General",
];

export function NewProductForm({ initialSku = "" }: { initialSku?: string }) {
  const router = useRouter();
  const [sku, setSku] = useState(initialSku);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("General");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [barcode, setBarcode] = useState("");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [catalog, setCatalog] = useState<ProductDTO[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState<ProductDTO | null>(null);
  const [preview, setPreview] = useState<ScanCapture | null>(null);

  useEffect(() => {
    void fetch("/api/products", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { products: ProductDTO[] }) => setCatalog(data.products))
      .catch(() => undefined);
  }, []);

  const conflict = useMemo(() => {
    const needle = sku.trim().toUpperCase();
    if (needle.length < 3) return null;
    return catalog.find((product) => product.sku === needle) ?? null;
  }, [catalog, sku]);

  const priceCents = parsePriceToCents(price);

  const handleCapture = (capture: ScanCapture, origin: "camera" | "upload") => {
    setPreview(capture);
    setErrors((prev) => ({ ...prev, enrollments: "" }));
    // Avoid stacking near-identical frames from the auto-probe loop.
    setCaptures((prev) => {
      if (origin === "camera" && prev.length >= 4) return prev;
      return [
        ...prev.slice(0, 3),
        {
          descriptor: capture.descriptor,
          thumbnail: capture.thumbnail,
          label: prev.length === 0 ? "front" : `angle-${prev.length + 1}`,
        },
      ];
    });
  };

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!sku.trim()) nextErrors.sku = "SKU is required";
    if (!name.trim()) nextErrors.name = "Product name is required";
    if (priceCents <= 0) nextErrors.price = "Enter a selling price greater than zero";
    if (!captures.length) nextErrors.enrollments = "Capture at least one image so detection can match it";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    if (conflict) {
      setRedirecting(conflict);
      setTimeout(() => router.push(`/catalog/${encodeURIComponent(conflict.sku)}?conflict=1`), 900);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku,
          name,
          category,
          priceCents,
          stock: Number(stock) || 0,
          lowStockThreshold: Number(lowStockThreshold) || 0,
          barcode,
          enrollments: captures.map((capture) => ({
            label: capture.label,
            descriptor: capture.descriptor,
            thumbnail: capture.thumbnail,
          })),
        }),
      });

      const data = await response.json();

      if (response.status === 409 && data?.conflict) {
        // SKU already on file → jump straight to the stock update page.
        setRedirecting(data.product as ProductDTO);
        setTimeout(() => router.push(`/catalog/${encodeURIComponent((data.product as ProductDTO).sku)}?conflict=1`), 900);
        return;
      }

      if (!response.ok) {
        setErrors(data?.errors ?? { form: data?.message ?? "Could not create the product" });
        return;
      }

      router.push(`/catalog/${encodeURIComponent((data.product as ProductDTO).sku)}?created=1`);
    } catch {
      setErrors({ form: "Network error while saving the product" });
    } finally {
      setSaving(false);
    }
  };

  if (redirecting) {
    return (
      <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
        <p className="text-3xl">🔁</p>
        <h2 className="mt-3 text-lg font-semibold text-white">SKU already exists</h2>
        <p className="mt-1 text-sm text-slate-300">
          <span className="font-mono text-emerald-300">{redirecting.sku}</span> — {redirecting.name} is already
          in the catalog, so the stock update page is opening instead of a duplicate product.
        </p>
        <p className="mt-3 text-xs text-slate-500">Restock, adjust the price, or add another camera angle there.</p>
        <Link
          href={`/catalog/${encodeURIComponent(redirecting.sku)}?conflict=1`}
          className="mt-4 inline-block rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950"
        >
          Open stock update page now
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <CameraScanner
          mode="enroll"
          probe
          autoLoop
          intervalMs={2200}
          heightClass="h-[360px] sm:h-[420px]"
          onCapture={handleCapture}
        />
        <div className="glass rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Detection captures ({captures.length})
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Each capture becomes a visual fingerprint. Add 2–3 angles (front / side / back) for the most reliable
            cashier recognition.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {captures.length === 0 ? (
              <span className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-[11px] text-slate-500">
                No captures yet — press “Capture this angle” with the product centred.
              </span>
            ) : (
              captures.map((capture, index) => (
                <div key={`${capture.label}-${index}`} className="relative">
                  <img
                    src={capture.thumbnail}
                    alt={capture.label}
                    className="h-20 w-20 rounded-xl border border-white/10 object-cover"
                  />
                  <span className="absolute -bottom-1 left-1 rounded bg-slate-950/85 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {capture.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCaptures((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-white/20 bg-slate-900 text-[10px] text-rose-300"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          {preview ? (
            <p className="mt-2 text-[11px] text-emerald-300">
              Latest frame descriptor computed ({preview.descriptor.hist.length}-bin chromaticity histogram + 6×6
              chroma layout + saturation grid + shape map).
            </p>
          ) : null}
        </div>
      </section>

      <section className="glass space-y-4 rounded-2xl p-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Product details</h2>
          <p className="text-[11px] text-slate-400">
            Price in dollars. Stock creates the opening inventory plus a movement record.
          </p>
        </div>

        <Field label="SKU" error={errors.sku}>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value.toUpperCase())}
            placeholder="e.g. BEV-COLA-330"
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
          />
        </Field>

        {conflict ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-xs text-amber-100">
            <p className="font-semibold">SKU {conflict.sku} already exists</p>
            <p className="mt-1 text-amber-200/90">
              {conflict.name} · stock {conflict.stock} · {conflict.fingerprintCount} fingerprint(s). Saving will open
              the stock update page instead of creating a new product.
            </p>
            <Link
              href={`/catalog/${encodeURIComponent(conflict.sku)}`}
              className="mt-2 inline-block rounded-lg bg-amber-400/20 px-2.5 py-1 text-[11px] font-medium text-amber-100"
            >
              Open stock update page →
            </Link>
          </div>
        ) : null}

        <Field label="Product name" error={errors.name}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Cola Classic 330ml"
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Barcode (optional)">
            <input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="8991000000017"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price ($)" error={errors.price}>
            <input
              value={price}
              inputMode="decimal"
              onChange={(event) => setPrice(event.target.value)}
              placeholder="1.99"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </Field>
          <Field label="Opening stock">
            <input
              value={stock}
              inputMode="numeric"
              onChange={(event) => setStock(event.target.value.replace(/[^0-9]/g, ""))}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </Field>
          <Field label="Low stock alert">
            <input
              value={lowStockThreshold}
              inputMode="numeric"
              onChange={(event) => setLowStockThreshold(event.target.value.replace(/[^0-9]/g, ""))}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
            />
          </Field>
        </div>

        {priceCents > 0 ? (
          <p className="text-[11px] text-emerald-300">Shelf price preview: {formatMoney(priceCents)}</p>
        ) : null}

        {errors.enrollments ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {errors.enrollments}
          </p>
        ) : null}
        {errors.form ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {errors.form}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving…" : conflict ? "SKU exists → update stock" : "Create product & enroll detection"}
          </button>
          <Link
            href="/catalog"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10"
          >
            Cancel
          </Link>
        </div>

        <p className="text-[11px] text-slate-500">
          On save the product is immediately searchable at the cashier terminal and its fingerprints join the live
          detection index.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-rose-300">{error}</span> : null}
    </label>
  );
}
