import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productFingerprints, products } from "@/db/schema";
import { isDescriptor } from "@/lib/vision";
import type { EnrollmentPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const decoded = decodeURIComponent(sku).trim().toUpperCase();
  const [product] = await db.select().from(products).where(eq(products.sku, decoded)).limit(1);
  if (!product) {
    return NextResponse.json({ ok: false, message: "Product not found" }, { status: 404 });
  }
  const rows = await db
    .select({
      id: productFingerprints.id,
      label: productFingerprints.label,
      thumbnail: productFingerprints.thumbnail,
      createdAt: productFingerprints.createdAt,
    })
    .from(productFingerprints)
    .where(eq(productFingerprints.productId, product.id))
    .orderBy(desc(productFingerprints.createdAt));

  return NextResponse.json({ ok: true, fingerprints: rows });
}

/**
 * Adds another camera capture (angle) to a product's detection dataset, so the
 * cashier camera can recognise the item from a different side / orientation.
 */
export async function POST(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const decoded = decodeURIComponent(sku).trim().toUpperCase();
  const [product] = await db.select().from(products).where(eq(products.sku, decoded)).limit(1);
  if (!product) {
    return NextResponse.json({ ok: false, message: "Product not found" }, { status: 404 });
  }

  let body: { enrollment?: EnrollmentPayload; label?: string };
  try {
    body = (await request.json()) as { enrollment?: EnrollmentPayload; label?: string };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const enrollment = body.enrollment;
  if (!enrollment || !isDescriptor(enrollment.descriptor)) {
    return NextResponse.json(
      { ok: false, message: "A captured descriptor is required" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(productFingerprints)
    .values({
      productId: product.id,
      label: body.label?.trim() || enrollment.label?.trim() || "new angle",
      descriptor: enrollment.descriptor,
      thumbnail: enrollment.thumbnail ?? null,
    })
    .returning({ id: productFingerprints.id });

  await db
    .update(products)
    .set({
      imageData: product.imageData ?? enrollment.thumbnail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));

  const count = await db
    .select({ id: productFingerprints.id })
    .from(productFingerprints)
    .where(eq(productFingerprints.productId, product.id));

  return NextResponse.json({ ok: true, fingerprintId: row.id, fingerprintCount: count.length }, { status: 201 });
}
