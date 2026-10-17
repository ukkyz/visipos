import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { detectionLogs, productFingerprints, products, saleItems, sales, stockMovements } from "@/db/schema";
import { getProductBySku, toProductDTO } from "@/server/detect";
import { parsePriceToCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sku: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { sku } = await params;
  const decoded = decodeURIComponent(sku).trim().toUpperCase();
  const product = await getProductBySku(decoded);
  if (!product) {
    return NextResponse.json({ ok: false, message: `No product with SKU ${decoded}` }, { status: 404 });
  }

  const [movements, fingerprints, sold] = await Promise.all([
    db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, product.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(25),
    db
      .select({
        id: productFingerprints.id,
        label: productFingerprints.label,
        thumbnail: productFingerprints.thumbnail,
        createdAt: productFingerprints.createdAt,
      })
      .from(productFingerprints)
      .where(eq(productFingerprints.productId, product.id))
      .orderBy(desc(productFingerprints.createdAt)),
    db
      .select({
        quantity: saleItems.quantity,
        lineTotalCents: saleItems.lineTotalCents,
        matchSource: saleItems.matchSource,
        confidence: saleItems.confidence,
        saleNumber: sales.saleNumber,
        createdAt: sales.createdAt,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(eq(saleItems.productId, product.id))
      .orderBy(desc(sales.createdAt))
      .limit(10),
  ]);

  const scans = await db
    .select()
    .from(detectionLogs)
    .where(eq(detectionLogs.productId, product.id))
    .orderBy(desc(detectionLogs.createdAt))
    .limit(10);

  return NextResponse.json({
    ok: true,
    product,
    movements: movements.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    fingerprints: fingerprints.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    recentSales: sold.map((row) => ({
      quantity: row.quantity,
      lineTotalCents: row.lineTotalCents,
      matchSource: row.matchSource,
      confidence: row.confidence,
      saleNumber: row.saleNumber,
      createdAt: row.createdAt.toISOString(),
    })),
    recentScans: scans.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { sku } = await params;
  const decoded = decodeURIComponent(sku).trim().toUpperCase();

  const [existing] = await db.select().from(products).where(eq(products.sku, decoded)).limit(1);
  if (!existing) {
    return NextResponse.json({ ok: false, message: `No product with SKU ${decoded}` }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  const errors: Record<string, string> = {};

  if (typeof payload.name === "string" && payload.name.trim()) updates.name = payload.name.trim();
  if (typeof payload.category === "string" && payload.category.trim()) {
    updates.category = payload.category.trim();
  }
  if (typeof payload.barcode === "string") updates.barcode = payload.barcode.trim() || null;

  if (payload.price !== undefined || payload.priceCents !== undefined) {
    const cents =
      typeof payload.priceCents === "number" ? Math.round(payload.priceCents) : parsePriceToCents(payload.price as string);
    if (cents <= 0) errors.price = "Price must be greater than zero";
    else updates.priceCents = cents;
  }
  if (payload.costCents !== undefined) {
    updates.costCents = Math.max(0, Math.round(Number(payload.costCents) || 0));
  }
  if (payload.lowStockThreshold !== undefined) {
    updates.lowStockThreshold = Math.max(0, Math.trunc(Number(payload.lowStockThreshold) || 0));
  }
  if (typeof payload.active === "boolean") updates.active = payload.active;

  let movement: { delta: number; reason: string; note: string | null } | null = null;
  const stockDelta = payload.stockDelta !== undefined ? Math.trunc(Number(payload.stockDelta)) : null;
  const stockAbsolute = payload.stockAbsolute !== undefined ? Math.trunc(Number(payload.stockAbsolute)) : null;

  if (stockAbsolute !== null && Number.isFinite(stockAbsolute)) {
    if (stockAbsolute < 0) errors.stock = "Stock cannot be negative";
    else {
      movement = {
        delta: stockAbsolute - existing.stock,
        reason: typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim() : "adjustment",
        note: typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null,
      };
      updates.stock = stockAbsolute;
    }
  } else if (stockDelta !== null && Number.isFinite(stockDelta) && stockDelta !== 0) {
    const next = existing.stock + stockDelta;
    if (next < 0) errors.stock = `Only ${existing.stock} unit(s) on hand`;
    else {
      movement = {
        delta: stockDelta,
        reason: typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim() : "adjustment",
        note: typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null,
      };
      updates.stock = next;
    }
  }

  if (Object.keys(errors).length) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(products).set(updates).where(eq(products.id, existing.id)).returning();
    if (movement && movement.delta !== 0) {
      await tx.insert(stockMovements).values({
        productId: existing.id,
        delta: movement.delta,
        resultingStock: row.stock,
        reason: movement.reason,
        note: movement.note,
      });
    }
    return row;
  });

  const fingerprintCount = await db
    .select({ id: productFingerprints.id })
    .from(productFingerprints)
    .where(eq(productFingerprints.productId, existing.id));

  return NextResponse.json({ ok: true, product: toProductDTO(updated, fingerprintCount.length) });
}
