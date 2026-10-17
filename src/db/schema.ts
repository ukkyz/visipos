import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { ProductDescriptor } from "@/lib/vision";

/**
 * Catalog products. Each product owns one or more visual fingerprints
 * (see `productFingerprints`) which the camera detection engine matches against.
 */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    priceCents: integer("price_cents").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    barcode: text("barcode"),
    imageData: text("image_data"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("products_sku_idx").on(table.sku)],
);

/**
 * Visual enrollments: every capture (angle) a product has been trained with.
 * The detection endpoint ranks all fingerprints against the live camera frame.
 */
export const productFingerprints = pgTable(
  "product_fingerprints",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("front"),
    descriptor: jsonb("descriptor").$type<ProductDescriptor>().notNull(),
    thumbnail: text("thumbnail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_fingerprints_product_idx").on(table.productId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    resultingStock: integer("resulting_stock").notNull(),
    reason: text("reason").notNull().default("adjustment"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("stock_movements_product_idx").on(table.productId)],
);

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  saleNumber: text("sale_number").notNull().unique(),
  cashier: text("cashier").notNull().default("Cashier"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  paidCents: integer("paid_cents").notNull().default(0),
  changeCents: integer("change_cents").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("cash"),
  status: text("status").notNull().default("paid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItems = pgTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    lineTotalCents: integer("line_total_cents").notNull(),
    matchSource: text("match_source").notNull().default("manual"),
    confidence: integer("confidence").notNull().default(0),
  },
  (table) => [index("sale_items_sale_idx").on(table.saleId)],
);

/**
 * Raw detection telemetry from the cashier camera: useful for tuning the
 * similarity threshold and auditing "what did the camera think?".
 */
export const detectionLogs = pgTable("detection_logs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku"),
  source: text("source").notNull().default("vision"),
  confidence: integer("confidence").notNull().default(0),
  distance: integer("distance").notNull().default(0),
  accepted: boolean("accepted").notNull().default(false),
  context: text("context").notNull().default("pos"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductRow = typeof products.$inferSelect;
export type FingerprintRow = typeof productFingerprints.$inferSelect;
export type SaleRow = typeof sales.$inferSelect;
export type SaleItemRow = typeof saleItems.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
export type DetectionLogRow = typeof detectionLogs.$inferSelect;
