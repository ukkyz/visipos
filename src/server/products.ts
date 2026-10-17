import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { detectionLogs, productFingerprints, products, saleItems, sales, stockMovements } from "@/db/schema";
import { getProductBySku } from "@/server/detect";
import type { ProductDTO } from "@/lib/types";

export type MovementView = {
  id: number;
  delta: number;
  resultingStock: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

export type FingerprintView = {
  id: number;
  label: string;
  thumbnail: string | null;
  createdAt: string;
};

export type ProductSaleView = {
  saleNumber: string;
  quantity: number;
  lineTotalCents: number;
  matchSource: string;
  confidence: number;
  createdAt: string;
};

export type ScanView = {
  id: number;
  source: string;
  confidence: number;
  distance: number;
  accepted: boolean;
  context: string;
  createdAt: string;
};

export type ProductDetail = {
  product: ProductDTO;
  movements: MovementView[];
  fingerprints: FingerprintView[];
  recentSales: ProductSaleView[];
  recentScans: ScanView[];
};

export async function getProductDetail(sku: string): Promise<ProductDetail | null> {
  const product = await getProductBySku(sku.trim().toUpperCase());
  if (!product) return null;

  const [movements, fingerprints, sold, scans] = await Promise.all([
    db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, product.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(20),
    db
      .select()
      .from(productFingerprints)
      .where(eq(productFingerprints.productId, product.id))
      .orderBy(desc(productFingerprints.createdAt)),
    db
      .select({
        saleNumber: sales.saleNumber,
        quantity: saleItems.quantity,
        lineTotalCents: saleItems.lineTotalCents,
        matchSource: saleItems.matchSource,
        confidence: saleItems.confidence,
        createdAt: sales.createdAt,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(eq(saleItems.productId, product.id))
      .orderBy(desc(sales.createdAt))
      .limit(8),
    db
      .select()
      .from(detectionLogs)
      .where(eq(detectionLogs.productId, product.id))
      .orderBy(desc(detectionLogs.createdAt))
      .limit(8),
  ]);

  return {
    product,
    movements: movements.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    fingerprints: fingerprints.map((row) => ({
      id: row.id,
      label: row.label,
      thumbnail: row.thumbnail,
      createdAt: row.createdAt.toISOString(),
    })),
    recentSales: sold.map((row) => ({
      saleNumber: row.saleNumber,
      quantity: row.quantity,
      lineTotalCents: row.lineTotalCents,
      matchSource: row.matchSource,
      confidence: row.confidence,
      createdAt: row.createdAt.toISOString(),
    })),
    recentScans: scans.map((row) => ({
      id: row.id,
      source: row.source,
      confidence: row.confidence,
      distance: row.distance,
      accepted: row.accepted,
      context: row.context,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
