import Link from "next/link";
import { notFound } from "next/navigation";
import { StockManager } from "@/components/StockManager";
import { getProductDetail } from "@/server/products";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ created?: string; conflict?: string }>;
}) {
  const { sku } = await params;
  const { created, conflict } = await searchParams;
  const detail = await getProductDetail(decodeURIComponent(sku));

  if (!detail) {
    return (
      <div className="glass mx-auto mt-10 max-w-lg rounded-2xl p-8 text-center">
        <p className="text-3xl">🔍</p>
        <h1 className="mt-3 text-lg font-semibold text-white">Product not found</h1>
        <p className="mt-1 text-sm text-slate-400">
          No product is enrolled under SKU <span className="font-mono">{decodeURIComponent(sku)}</span>.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            href="/catalog/new"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Add it with the camera
          </Link>
          <Link
            href="/catalog"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-200"
          >
            Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  if (!detail.product) notFound();

  return (
    <div className="space-y-5">
      <nav className="text-[11px] text-slate-500">
        <Link href="/catalog" className="hover:text-slate-300">
          Catalog
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-300">{detail.product.sku}</span>
      </nav>

      <StockManager
        product={detail.product}
        movements={detail.movements}
        fingerprints={detail.fingerprints}
        recentSales={detail.recentSales}
        recentScans={detail.recentScans}
        created={created === "1"}
        conflict={conflict === "1"}
      />
    </div>
  );
}
