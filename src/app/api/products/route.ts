import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productFingerprints, products, stockMovements } from "@/db/schema";
import { listProducts, toProductDTO } from "@/server/detect";
import { parsePriceToCents } from "@/lib/money";
import { isDescriptor } from "@/lib/vision";
import type { EnrollmentPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listProducts();
  return NextResponse.json({ ok: true, products: items });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    sku?: string;
    name?: string;
    category?: string;
    price?: string | number;
    priceCents?: number;
    costCents?: number;
    stock?: number;
    lowStockThreshold?: number;
    barcode?: string | null;
    enrollments?: EnrollmentPayload[];
  };

  const sku = (payload.sku ?? "").trim().toUpperCase();
  const name = (payload.name ?? "").trim();
  const category = (payload.category ?? "General").trim() || "General";
  const priceCents =
    typeof payload.priceCents === "number" ? Math.round(payload.priceCents) : parsePriceToCents(payload.price ?? 0);
  const costCents = typeof payload.costCents === "number" ? Math.round(payload.costCents) : 0;
  const stock = Number.isFinite(payload.stock) ? Math.max(0, Math.trunc(payload.stock as number)) : 0;
  const lowStockThreshold = Number.isFinite(payload.lowStockThreshold)
    ? Math.max(0, Math.trunc(payload.lowStockThreshold as number))
    : 5;
  const barcode = payload.barcode?.trim() ? payload.barcode.trim() : null;

  const errors: Record<string, string> = {};
  if (!sku) errors.sku = "SKU is required";
  if (!name) errors.name = "Product name is required";
  if (priceCents <= 0) errors.price = "Set a selling price greater than zero";

  const enrollments = (payload.enrollments ?? []).filter((entry) => isDescriptor(entry?.descriptor));
  if (!enrollments.length) {
    errors.enrollments = "Capture at least one camera image so the item can be detected";
  }

  if (Object.keys(errors).length) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const [existing] = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (existing) {
    // The SKU already exists -> the client redirects to the stock update page.
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        matchedBy: "sku",
        message: `SKU ${sku} already exists. Open the stock update page instead of creating a duplicate.`,
        product: toProductDTO(existing),
      },
      { status: 409 },
    );
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        sku,
        name,
        category,
        priceCents,
        costCents,
        stock,
        lowStockThreshold,
        barcode,
        imageData: enrollments[0].thumbnail ?? null,
      })
      .returning();

    await tx.insert(productFingerprints).values(
      enrollments.map((entry, index) => ({
        productId: row.id,
        label: entry.label?.trim() || (index === 0 ? "front" : `angle-${index + 1}`),
        descriptor: entry.descriptor,
        thumbnail: entry.thumbnail ?? null,
      })),
    );

    await tx.insert(stockMovements).values({
      productId: row.id,
      delta: stock,
      resultingStock: stock,
      reason: "initial",
      note: "Created together with camera enrollment",
    });

    return row;
  });

  return NextResponse.json(
    {
      ok: true,
      product: toProductDTO(created, enrollments.length),
      enrolled: enrollments.length,
    },
    { status: 201 },
  );
}
