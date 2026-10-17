import { CatalogClient } from "@/components/CatalogClient";
import { listProducts } from "@/server/detect";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const products = await listProducts();
  return <CatalogClient initialProducts={products} />;
}
