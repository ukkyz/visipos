import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { detectionLogs, productFingerprints, products } from "@/db/schema";
import type { DetectMatch, ProductDTO } from "@/lib/types";
import { descriptorDistance, type ProductDescriptor } from "@/lib/vision";

export const DEFAULT_THRESHOLD = 0.66;
const LOG_KEEP = 200;

export function toProductDTO(
  row: typeof products.$inferSelect,
  fingerprintCount = 0,
): ProductDTO {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    priceCents: row.priceCents,
    costCents: row.costCents,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    barcode: row.barcode,
    imageData: row.imageData,
    active: row.active,
    fingerprintCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProducts(): Promise<ProductDTO[]> {
  const rows = await db
    .select({
      product: products,
      fingerprintCount: sql<number>`count(${productFingerprints.id})::int`,
    })
    .from(products)
    .leftJoin(productFingerprints, eq(productFingerprints.productId, products.id))
    .groupBy(products.id)
    .orderBy(desc(products.updatedAt));

  return rows.map((row) => toProductDTO(row.product, row.fingerprintCount ?? 0));
}

export async function getProductBySku(sku: string): Promise<ProductDTO | null> {
  const [row] = await db
    .select({
      product: products,
      fingerprintCount: sql<number>`count(${productFingerprints.id})::int`,
    })
    .from(products)
    .leftJoin(productFingerprints, eq(productFingerprints.productId, products.id))
    .where(eq(products.sku, sku))
    .groupBy(products.id)
    .limit(1);

  if (!row) return null;
  return toProductDTO(row.product, row.fingerprintCount ?? 0);
}

export const MIN_MARGIN = 0.035;
export const STRONG_MATCH = 0.94;

export async function detectProduct(options: {
  descriptor: ProductDescriptor;
  barcode?: string | null;
  threshold?: number;
  context?: "pos" | "enroll";
  log?: boolean;
}): Promise<{
  match: DetectMatch | null;
  runnersUp: DetectMatch[];
  ambiguousWith: DetectMatch | null;
  scanned: number;
  barcodeHit: string | null;
}> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const barcode = options.barcode?.trim() || null;

  if (barcode) {
    const [hit] = await db
      .select({ product: products })
      .from(products)
      .where(and(eq(products.barcode, barcode), eq(products.active, true)))
      .limit(1);
    if (hit) {
      const match: DetectMatch = {
        product: toProductDTO(hit.product),
        confidence: 1,
        distance: 0,
        source: "barcode",
        fingerprintId: 0,
        label: "barcode",
      };
      if (options.log !== false) {
        await logDetection({
          productId: hit.product.id,
          sku: hit.product.sku,
          source: "barcode",
          confidence: 1,
          distance: 0,
          accepted: true,
          context: options.context ?? "pos",
        });
      }
      return { match, runnersUp: [], ambiguousWith: null, scanned: 0, barcodeHit: barcode };
    }
  }

  const rows = await db
    .select({ fingerprint: productFingerprints, product: products })
    .from(productFingerprints)
    .innerJoin(products, eq(products.id, productFingerprints.productId))
    .where(eq(products.active, true));

  const ranked: DetectMatch[] = rows
    .map((row) => {
      const distance = descriptorDistance(options.descriptor, row.fingerprint.descriptor);
      return {
        product: toProductDTO(row.product),
        confidence: Math.max(0, Math.min(1, 1 - distance)),
        distance,
        source: "vision" as const,
        fingerprintId: row.fingerprint.id,
        label: row.fingerprint.label,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  // Collapse duplicate products (multi-angle enrollments) keeping the best score.
  const bestPerProduct = new Map<number, DetectMatch>();
  for (const candidate of ranked) {
    const existing = bestPerProduct.get(candidate.product.id);
    if (!existing || existing.confidence < candidate.confidence) {
      bestPerProduct.set(candidate.product.id, candidate);
    }
  }
  const unique = Array.from(bestPerProduct.values()).sort((a, b) => b.confidence - a.confidence);

  const best = unique[0] ?? null;
  const second = unique[1] ?? null;

  // Accept only above the threshold AND with enough separation from the
  // runner-up, otherwise a look-alike product could be charged by mistake.
  let match: DetectMatch | null = null;
  let ambiguousWith: DetectMatch | null = null;
  if (best && best.confidence >= threshold) {
    const separated = !second || best.confidence - second.confidence >= MIN_MARGIN;
    if (separated || best.confidence >= STRONG_MATCH) {
      match = best;
    } else {
      ambiguousWith = second;
    }
  }

  if (options.log !== false && best) {
    await logDetection({
      productId: best.product.id,
      sku: best.product.sku,
      source: "vision",
      confidence: Math.round(best.confidence * 100),
      distance: Math.round(best.distance * 100),
      accepted: Boolean(match),
      context: options.context ?? "pos",
    });
  }

  return {
    match,
    runnersUp: match ? unique.slice(1, 5) : unique.slice(0, 4),
    ambiguousWith,
    scanned: rows.length,
    barcodeHit: null,
  };
}

export async function logDetection(input: {
  productId: number | null;
  sku: string | null;
  source: string;
  confidence: number;
  distance: number;
  accepted: boolean;
  context: string;
}) {
  await db.insert(detectionLogs).values({
    productId: input.productId ?? null,
    sku: input.sku,
    source: input.source,
    confidence: input.confidence,
    distance: input.distance,
    accepted: input.accepted,
    context: input.context,
  });

  // Keep the telemetry table small in this demo environment.
  await db.execute(sql`
    delete from detection_logs
    where id not in (select id from detection_logs order by created_at desc limit ${LOG_KEEP})
  `);
}
