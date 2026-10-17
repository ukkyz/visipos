import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productFingerprints, products } from "@/db/schema";
import { descriptorDistance } from "@/lib/vision";

export type SeparationReport = {
  products: number;
  fingerprints: number;
  /** Highest distance found between two captures of the SAME product (< 1 is good). */
  maxIntraDistance: number;
  /** Lowest distance found between two DIFFERENT products (higher is better). */
  minInterDistance: number;
  averageInterDistance: number;
  ambiguousPairs: { a: string; b: string; distance: number }[];
};

/**
 * Model diagnostics: how well separated are the enrolled fingerprints? A healthy
 * catalog keeps `maxIntraDistance` low and `minInterDistance` high.
 */
export async function computeSeparation(): Promise<SeparationReport> {
  const rows = await db
    .select({
      productId: products.id,
      sku: products.sku,
      descriptor: productFingerprints.descriptor,
      fingerprintId: productFingerprints.id,
    })
    .from(productFingerprints)
    .innerJoin(products, eq(products.id, productFingerprints.productId));

  const perProduct = new Map<number, { sku: string; descriptors: typeof rows[number]["descriptor"][] }>();
  for (const row of rows) {
    const entry = perProduct.get(row.productId) ?? { sku: row.sku, descriptors: [] };
    entry.descriptors.push(row.descriptor);
    perProduct.set(row.productId, entry);
  }

  let maxIntra = 0;
  for (const entry of perProduct.values()) {
    for (let i = 0; i < entry.descriptors.length; i += 1) {
      for (let j = i + 1; j < entry.descriptors.length; j += 1) {
        maxIntra = Math.max(maxIntra, descriptorDistance(entry.descriptors[i], entry.descriptors[j]));
      }
    }
  }

  const entries = Array.from(perProduct.values());
  const pairs: { a: string; b: string; distance: number }[] = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      let lowest = 1;
      for (const left of entries[i].descriptors) {
        for (const right of entries[j].descriptors) {
          lowest = Math.min(lowest, descriptorDistance(left, right));
        }
      }
      pairs.push({ a: entries[i].sku, b: entries[j].sku, distance: lowest });
      sum += lowest;
      count += 1;
    }
  }
  pairs.sort((x, y) => x.distance - y.distance);

  return {
    products: entries.length,
    fingerprints: rows.length,
    maxIntraDistance: Number(maxIntra.toFixed(4)),
    minInterDistance: pairs.length ? Number(pairs[0].distance.toFixed(4)) : 1,
    averageInterDistance: count ? Number((sum / count).toFixed(4)) : 0,
    ambiguousPairs: pairs.slice(0, 5).map((pair) => ({ ...pair, distance: Number(pair.distance.toFixed(4)) })),
  };
}
