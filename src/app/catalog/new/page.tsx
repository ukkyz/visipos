import { NewProductForm } from "@/components/NewProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-white">Add product with camera</h1>
        <p className="text-sm text-slate-400">
          Capture the item, set price and stock — the product is enrolled into camera detection in one step. If the
          SKU already exists you are redirected to its stock update page instead.
        </p>
      </header>
      <NewProductForm initialSku={sku ?? ""} />
    </div>
  );
}
