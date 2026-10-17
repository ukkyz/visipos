import type { ProductDescriptor } from "@/lib/vision";

export type ProductDTO = {
  id: number;
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  costCents: number;
  stock: number;
  lowStockThreshold: number;
  barcode: string | null;
  imageData: string | null;
  active: boolean;
  fingerprintCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DetectMatch = {
  product: ProductDTO;
  confidence: number;
  distance: number;
  source: "vision" | "barcode";
  fingerprintId: number;
  label: string;
};

export type DetectResponse = {
  ok: boolean;
  scannedFingerprints: number;
  match: DetectMatch | null;
  runnersUp: DetectMatch[];
  ambiguousWith?: DetectMatch | null;
  threshold: number;
  barcode?: string | null;
  message?: string;
};

export type CartLine = {
  key: string;
  productId: number;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  matchSource: "vision" | "barcode" | "manual";
  confidence: number;
  imageData: string | null;
};

export type SaleReceipt = {
  sale: {
    id: number;
    saleNumber: string;
    cashier: string;
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    paidCents: number;
    changeCents: number;
    paymentMethod: string;
    createdAt: string;
  };
  items: {
    sku: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    matchSource: string;
    confidence: number;
  }[];
};

export type EnrollmentPayload = {
  label?: string;
  descriptor: ProductDescriptor;
  thumbnail: string | null;
};
