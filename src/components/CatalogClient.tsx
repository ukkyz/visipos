"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";

export function CatalogClient({ initialProducts }: { initialProducts: ProductDTO[] }) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductDTO[]>(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(products.map((product) => product.category))).sort()],
    [products],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !needle ||
        product.name.toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle) ||
        (product.barcode ?? "").includes(needle);
      const matchesCategory = category === "all" || product.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [category, products, query]);

  const loadDemo = async () => {
    setSeeding(true);
    setMessage(null);
    try {
      const response = await fetch("/api/catalog/demo", { method: "POST" });
      const data = (await response.json()) as { inserted: number; skipped: number };
      const refreshed = await fetch("/api/products", { cache: "no-store" });
      const payload = (await refreshed.json()) as { products: ProductDTO[] };
      setProducts(payload.products);
      setMessage(
        `Demo catalog loaded: ${data.inserted} product(s) enrolled with generated fingerprints, ${data.skipped} already present.`,
      );
      router.refresh();
    } catch {
      setMessage("Could not load the demo catalog.");
    } finally {
      setSeeding(false);
    }
  };

  const lowStock = products.filter((product) => product.stock <= product.lowStockThreshold);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Product catalog</h1>
          <p className="text-sm text-slate-400">
            {products.length} products · {products.reduce((sum, p) => sum + p.fingerprintCount, 0)} visual
            fingerprints · {lowStock.length} low on stock
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDemo()}
            disabled={seeding}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {seeding ? "Loading…" : "Load demo catalog"}
          </button>
          <Link
            href="/catalog/new"
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110"
          >
            📷 Add product with camera
          </Link>
        </div>
      </header>

      {message ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100">
          {message}
        </p>
      ) : null}

      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, SKU or barcode"
          className="w-64 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/60"
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                category === item
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {item === "all" ? "All categories" : item}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-slate-500">
          Click a product to open its stock update page
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((product) => {
          const low = product.stock <= product.lowStockThreshold;
          return (
            <Link
              key={product.id}
              href={`/catalog/${encodeURIComponent(product.sku)}`}
              className="glass group flex gap-3 rounded-2xl p-3 transition hover:border-emerald-400/40 hover:bg-emerald-400/5"
            >
              {product.imageData ? (
                <img
                  src={product.imageData}
                  alt={product.name}
                  className="h-20 w-20 flex-none rounded-xl object-cover"
                />
              ) : (
                <span className="grid h-20 w-20 flex-none place-items-center rounded-xl bg-slate-800 text-2xl">
                  📦
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{product.name}</p>
                <p className="font-mono text-[11px] text-slate-400">{product.sku}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {product.category} · {product.fingerprintCount} print
                  {product.fingerprintCount === 1 ? "" : "s"}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-sm text-emerald-300">
                    {formatMoney(product.priceCents)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      product.stock <= 0
                        ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                        : low
                          ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                          : "border-white/10 bg-white/5 text-slate-300"
                    }`}
                  >
                    stock {product.stock}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 ? (
          <div className="glass col-span-full rounded-2xl p-8 text-center text-sm text-slate-400">
            No products match. Try “Load demo catalog” or add a product using the camera.
          </div>
        ) : null}
      </div>
    </div>
  );
}
