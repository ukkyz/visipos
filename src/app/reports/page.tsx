import Link from "next/link";
import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { detectionLogs, products, saleItems, sales } from "@/db/schema";
import { computeSeparation } from "@/server/diagnostics";
import { DEFAULT_THRESHOLD, MIN_MARGIN } from "@/server/detect";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [separation, weekSales, weekItems, lowStock, recentSales, logs] = await Promise.all([
    computeSeparation(),
    db
      .select({ id: sales.id, totalCents: sales.totalCents, createdAt: sales.createdAt })
      .from(sales)
      .where(gte(sales.createdAt, weekAgo)),
    db
      .select({
        sku: saleItems.sku,
        name: saleItems.name,
        quantity: saleItems.quantity,
        lineTotalCents: saleItems.lineTotalCents,
        matchSource: saleItems.matchSource,
        createdAt: sales.createdAt,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(gte(sales.createdAt, weekAgo)),
    db
      .select()
      .from(products)
      .where(sql`${products.stock} <= ${products.lowStockThreshold}`)
      .orderBy(products.stock)
      .limit(8),
    db.select().from(sales).orderBy(desc(sales.createdAt)).limit(6),
    db.select().from(detectionLogs).orderBy(desc(detectionLogs.createdAt)).limit(120),
  ]);

  const recentSaleIds = recentSales.map((sale) => sale.id);
  const recentItems = recentSaleIds.length
    ? await db.select().from(saleItems).where(inArray(saleItems.saleId, recentSaleIds))
    : [];

  const todaySales = weekSales.filter((sale) => sale.createdAt >= startOfDay);
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.totalCents, 0);
  const weekRevenue = weekSales.reduce((sum, sale) => sum + sale.totalCents, 0);
  const todayUnits = weekItems
    .filter((item) => item.createdAt >= startOfDay)
    .reduce((sum, item) => sum + item.quantity, 0);

  const days: { key: string; label: string; revenue: number; units: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const daySales = weekSales.filter((sale) => sale.createdAt >= day && sale.createdAt < next);
    const dayUnits = weekItems
      .filter((item) => item.createdAt >= day && item.createdAt < next)
      .reduce((sum, item) => sum + item.quantity, 0);
    days.push({
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      revenue: daySales.reduce((sum, sale) => sum + sale.totalCents, 0),
      units: dayUnits,
    });
  }
  const peak = Math.max(1, ...days.map((day) => day.revenue));

  const topProducts = Object.values(
    weekItems.reduce<Record<string, { name: string; sku: string; units: number; revenue: number }>>(
      (acc, item) => {
        acc[item.sku] = acc[item.sku] ?? { name: item.name, sku: item.sku, units: 0, revenue: 0 };
        acc[item.sku].units += item.quantity;
        acc[item.sku].revenue += item.lineTotalCents;
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => b.units - a.units)
    .slice(0, 6);

  const visionItems = weekItems.filter((item) => item.matchSource === "vision" || item.matchSource === "barcode");
  const visionUnits = visionItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalUnits = weekItems.reduce((sum, item) => sum + item.quantity, 0);
  const accepted = logs.filter((log) => log.accepted).length;
  const avgConfidence = logs.length
    ? logs.reduce((sum, log) => sum + log.confidence, 0) / logs.length / 100
    : 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-white">Reports</h1>
        <p className="text-sm text-slate-400">
          Sales performance and how well the camera detection engine is performing.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Today revenue" value={formatMoney(todayRevenue)} hint={`${todaySales.length} transactions`} />
        <Card label="7-day revenue" value={formatMoney(weekRevenue)} hint={`${weekSales.length} transactions`} />
        <Card label="Units sold today" value={String(todayUnits)} hint={`${totalUnits} in 7 days`} accent />
        <Card
          label="Camera-added units"
          value={totalUnits ? formatPercent(visionUnits / totalUnits) : "0%"}
          hint={`${visionUnits} of ${totalUnits} units (7 days)`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Revenue, last 7 days</h2>
          <div className="flex h-40 items-end gap-3">
            {days.map((day) => (
              <div key={day.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-slate-400">
                  {day.revenue ? formatMoney(day.revenue) : "—"}
                </span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600/40 to-emerald-400"
                  style={{ height: `${Math.max(4, (day.revenue / peak) * 100)}%` }}
                  title={`${day.units} units`}
                />
                <span className="text-[11px] text-slate-500">{day.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Detection quality</h2>
          <div className="space-y-2 text-xs">
            <Row label="Frames analysed" value={String(logs.length)} />
            <Row label="Accepted matches" value={`${accepted} (${logs.length ? formatPercent(accepted / logs.length) : "0%"})`} />
            <Row label="Average confidence" value={formatPercent(avgConfidence)} />
            <Row label="Enrolled fingerprints" value={String(separation.fingerprints)} />
          </div>
          <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Fingerprint separation
            </h3>
            <Row label="Products / fingerprints" value={`${separation.products} / ${separation.fingerprints}`} />
            <Row
              label="Closest pair distance"
              value={separation.fingerprints > 1 ? separation.minInterDistance.toFixed(3) : "—"}
            />
            <Row
              label="Average inter-product distance"
              value={separation.averageInterDistance.toFixed(3)}
            />
            <Row
              label="Accept rule"
              value={`≥ ${formatPercent(DEFAULT_THRESHOLD)} + ${MIN_MARGIN} margin`}
            />
            {separation.ambiguousPairs.length > 1 ? (
              <p className="text-[11px] text-amber-200/90">
                Tightest pairs:{" "}
                {separation.ambiguousPairs
                  .slice(0, 2)
                  .map((pair) => `${pair.a} ↔ ${pair.b} (${pair.distance.toFixed(2)})`)
                  .join(", ")}{" "}
                — capture extra angles for those SKUs.
              </p>
            ) : null}
          </div>

          <div className="mt-4 space-y-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Latest frames
            </h3>
            {logs.slice(0, 7).map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px]"
              >
                <span className={log.accepted ? "text-emerald-300" : "text-amber-300"}>
                  {log.accepted ? "match" : "candidate"}
                </span>
                <span className="font-mono text-slate-300">{log.sku ?? "—"}</span>
                <span className="text-slate-400">{log.source}</span>
                <span className="font-mono text-slate-400">{log.confidence}%</span>
                <span className="ml-auto text-slate-600">{formatDateTime(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Top sellers (7 days)</h2>
          {topProducts.length === 0 ? (
            <p className="text-[11px] text-slate-500">No sales recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {topProducts.map((product) => (
                <li key={product.sku} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-slate-200">{product.name}</span>
                  <span className="font-mono text-slate-400">×{product.units}</span>
                  <span className="font-mono text-emerald-300">{formatMoney(product.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Low stock alerts</h2>
          {lowStock.length === 0 ? (
            <p className="text-[11px] text-slate-500">Everything is above its alert threshold.</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.map((product) => (
                <li key={product.id} className="flex items-center gap-2 text-xs">
                  <Link
                    href={`/catalog/${encodeURIComponent(product.sku)}`}
                    className="min-w-0 flex-1 truncate text-slate-200 hover:text-white"
                  >
                    {product.name}
                  </Link>
                  <span className="font-mono text-amber-300">{product.stock}</span>
                  <span className="text-slate-500">/ {product.lowStockThreshold}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Recent transactions</h2>
          {recentSales.length === 0 ? (
            <p className="text-[11px] text-slate-500">No transactions yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentSales.map((sale) => {
                const items = recentItems.filter((item) => item.saleId === sale.id);
                return (
                  <li key={sale.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">{sale.saleNumber}</span>
                      <span className="font-mono text-emerald-300">{formatMoney(sale.totalCents)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-slate-500">
                      <span>
                        {items.length} line(s) · {sale.paymentMethod}
                      </span>
                      <span>{formatDateTime(sale.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}



function Card({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass rounded-2xl p-4 ${accent ? "border-emerald-400/30 bg-emerald-400/5" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-100">{value}</span>
    </div>
  );
}
