import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { saleItems, sales } from "@/db/schema";
import { PosTerminal } from "@/components/PosTerminal";
import { listProducts } from "@/server/detect";

export const dynamic = "force-dynamic";

export default async function CashierPage() {
  const products = await listProducts();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [today] = await db
    .select({
      saleCount: sql<number>`count(*)::int`,
      revenueCents: sql<number>`coalesce(sum(${sales.totalCents}), 0)::int`,
    })
    .from(sales)
    .where(gte(sales.createdAt, startOfDay));

  const [units] = await db
    .select({ unitsSold: sql<number>`coalesce(sum(${saleItems.quantity}), 0)::int` })
    .from(saleItems)
    .innerJoin(sales, and(eq(sales.id, saleItems.saleId), gte(sales.createdAt, startOfDay)));

  const enrolled = products.reduce((sum, product) => sum + product.fingerprintCount, 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cashier terminal</h1>
          <p className="text-sm text-slate-400">
            Camera detection → cart → payment. {products.length} catalog products · {enrolled} visual
            fingerprints enrolled.
          </p>
        </div>
        {products.length === 0 ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
            Catalog is empty — add products with the camera (or load the demo catalog) to activate detection.
          </div>
        ) : null}
      </header>

      <PosTerminal
        initialProducts={products}
        todayStats={{
          saleCount: today?.saleCount ?? 0,
          revenueCents: today?.revenueCents ?? 0,
          unitsSold: units?.unitsSold ?? 0,
        }}
      />
    </div>
  );
}
