import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, saleItems, sales, stockMovements } from "@/db/schema";
import { computeTotals } from "@/lib/money";
import type { SaleReceipt } from "@/lib/types";

export const dynamic = "force-dynamic";

type IncomingItem = {
  productId: number;
  quantity: number;
  matchSource?: string;
  confidence?: number;
};

function buildSaleNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const random = Math.floor(1000 + Math.random() * 8999);
  return `INV-${stamp}-${random}`;
}

export async function GET() {
  const rows = await db.select().from(sales).orderBy(desc(sales.createdAt)).limit(20);
  return NextResponse.json({
    ok: true,
    sales: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  });
}

export async function POST(request: Request) {
  let body: {
    items?: IncomingItem[];
    paymentMethod?: string;
    paidCents?: number;
    discountCents?: number;
    cashier?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const items = (body.items ?? []).filter((item) => item && item.productId && item.quantity > 0);
  if (!items.length) {
    return NextResponse.json({ ok: false, message: "Cart is empty" }, { status: 400 });
  }

  const ids = Array.from(new Set(items.map((item) => item.productId)));
  const dbProducts = await db.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(dbProducts.map((row) => [row.id, row]));

  const errors: { sku: string; message: string }[] = [];
  const requestedQty = new Map<number, number>();
  for (const item of items) {
    requestedQty.set(item.productId, (requestedQty.get(item.productId) ?? 0) + Math.trunc(item.quantity));
  }

  for (const [productId, quantity] of requestedQty) {
    const product = byId.get(productId);
    if (!product) {
      errors.push({ sku: `#${productId}`, message: "Product no longer exists" });
      continue;
    }
    if (quantity > product.stock) {
      errors.push({
        sku: product.sku,
        message: `Only ${product.stock} unit(s) of ${product.name} in stock`,
      });
    }
  }

  if (errors.length) {
    return NextResponse.json({ ok: false, errors }, { status: 409 });
  }

  const pricedItems = items.map((item) => {
    const product = byId.get(item.productId)!;
    const quantity = Math.trunc(item.quantity);
    return {
      product,
      quantity,
      unitPriceCents: product.priceCents,
      lineTotalCents: product.priceCents * quantity,
      matchSource: item.matchSource ?? "manual",
      confidence: Math.round(Number(item.confidence) || 0),
    };
  });

  const subtotalCents = pricedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCents = Math.max(0, Math.trunc(Number(body.discountCents) || 0));
  const totals = computeTotals(subtotalCents, discountCents);
  const paymentMethod = (body.paymentMethod ?? "cash").toLowerCase();
  const paidCents =
    paymentMethod === "cash"
      ? Math.max(totals.totalCents, Math.trunc(Number(body.paidCents) || totals.totalCents))
      : totals.totalCents;

  const receipt = await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(sales)
      .values({
        saleNumber: buildSaleNumber(),
        cashier: (body.cashier ?? "Cashier").trim() || "Cashier",
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        paidCents,
        changeCents: Math.max(0, paidCents - totals.totalCents),
        paymentMethod,
        status: "paid",
      })
      .returning();

    await tx.insert(saleItems).values(
      pricedItems.map((item) => ({
        saleId: sale.id,
        productId: item.product.id,
        sku: item.product.sku,
        name: item.product.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
        matchSource: item.matchSource,
        confidence: item.confidence,
      })),
    );

    for (const [productId, quantity] of requestedQty) {
      const product = byId.get(productId)!;
      await tx
        .update(products)
        .set({ stock: product.stock - quantity, updatedAt: new Date() })
        .where(eq(products.id, productId));
      await tx.insert(stockMovements).values({
        productId,
        delta: -quantity,
        resultingStock: product.stock - quantity,
        reason: "sale",
        note: `Sold on ${sale.saleNumber}`,
      });
    }

    return sale;
  });

  const payload: SaleReceipt = {
    sale: { ...receipt, createdAt: receipt.createdAt.toISOString() },
    items: pricedItems.map((item) => ({
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      matchSource: item.matchSource,
      confidence: item.confidence,
    })),
  };

  return NextResponse.json({ ok: true, receipt: payload }, { status: 201 });
}
