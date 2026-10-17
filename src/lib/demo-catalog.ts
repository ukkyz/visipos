import { computeDescriptor, type PixelBuffer, type ProductDescriptor } from "@/lib/vision";

export type DemoSpec = {
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  costCents: number;
  stock: number;
  lowStockThreshold: number;
  barcode: string;
  shape: "bottle" | "can" | "box" | "pouch";
  bg: string;
  label: string;
  accent: string;
  stripe: string;
};

export const DEMO_CATALOG: DemoSpec[] = [
  {
    sku: "BEV-COLA-330",
    name: "Cola Classic 330ml",
    category: "Beverages",
    priceCents: 199,
    costCents: 110,
    stock: 48,
    lowStockThreshold: 12,
    barcode: "8991000000017",
    shape: "can",
    bg: "#c8202e",
    label: "#f4f4f5",
    accent: "#1b1b1f",
    stripe: "#f2c14e",
  },
  {
    sku: "BEV-WATER-600",
    name: "Mineral Water 600ml",
    category: "Beverages",
    priceCents: 99,
    costCents: 40,
    stock: 72,
    lowStockThreshold: 20,
    barcode: "8991000000024",
    shape: "bottle",
    bg: "#8fd6f0",
    label: "#ffffff",
    accent: "#0f6fa6",
    stripe: "#22c1a3",
  },
  {
    sku: "SNK-CHIPS-PAP",
    name: "Paprika Chips 90g",
    category: "Snacks",
    priceCents: 289,
    costCents: 160,
    stock: 30,
    lowStockThreshold: 10,
    barcode: "8991000000031",
    shape: "pouch",
    bg: "#e4242f",
    label: "#ffe08a",
    accent: "#8a1d20",
    stripe: "#ffffff",
  },
  {
    sku: "SNK-CHOCO-70",
    name: "Dark Chocolate 70% 100g",
    category: "Snacks",
    priceCents: 349,
    costCents: 210,
    stock: 24,
    lowStockThreshold: 8,
    barcode: "8991000000048",
    shape: "box",
    bg: "#4b2e1e",
    label: "#d9a441",
    accent: "#f4e3c1",
    stripe: "#2a1a12",
  },
  {
    sku: "BEV-ENERGY-300",
    name: "Energy Boost 300ml",
    category: "Beverages",
    priceCents: 259,
    costCents: 140,
    stock: 36,
    lowStockThreshold: 12,
    barcode: "8991000000055",
    shape: "can",
    bg: "#12141c",
    label: "#7dfc3f",
    accent: "#e2f54a",
    stripe: "#2f3448",
  },
  {
    sku: "CARE-SHAMPOO-250",
    name: "Herbal Shampoo 250ml",
    category: "Personal Care",
    priceCents: 549,
    costCents: 320,
    stock: 18,
    lowStockThreshold: 6,
    barcode: "8991000000062",
    shape: "bottle",
    bg: "#2f8f6b",
    label: "#f6fff9",
    accent: "#cfeee0",
    stripe: "#84c7a9",
  },
  {
    sku: "HOME-DISH-500",
    name: "Dish Soap Lemon 500ml",
    category: "Household",
    priceCents: 379,
    costCents: 210,
    stock: 22,
    lowStockThreshold: 8,
    barcode: "8991000000079",
    shape: "bottle",
    bg: "#f2d024",
    label: "#ffffff",
    accent: "#3b8f2f",
    stripe: "#fdf3b8",
  },
  {
    sku: "COF-GROUND-200",
    name: "Ground Coffee 200g",
    category: "Pantry",
    priceCents: 749,
    costCents: 430,
    stock: 14,
    lowStockThreshold: 5,
    barcode: "8991000000086",
    shape: "pouch",
    bg: "#6b3f22",
    label: "#f0d8b8",
    accent: "#2c1a10",
    stripe: "#c58a4b",
  },
  {
    sku: "PAN-NOODLE-CHK",
    name: "Instant Noodle Chicken",
    category: "Pantry",
    priceCents: 149,
    costCents: 80,
    stock: 90,
    lowStockThreshold: 24,
    barcode: "8991000000093",
    shape: "pouch",
    bg: "#f5b12a",
    label: "#ffffff",
    accent: "#d63a1f",
    stripe: "#7d3f12",
  },
  {
    sku: "STA-NOTEBOOK-A5",
    name: "Notebook A5 Ruled",
    category: "Stationery",
    priceCents: 259,
    costCents: 130,
    stock: 40,
    lowStockThreshold: 10,
    barcode: "8991000000109",
    shape: "box",
    bg: "#3b5bdb",
    label: "#ffffff",
    accent: "#a5c0ff",
    stripe: "#1f2a63",
  },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Procedurally paints a synthetic "product photo" so the demo catalog has real descriptors. */
function renderSpec(spec: DemoSpec, size = 240): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const surface: [number, number, number] = [232, 232, 230];
  const shadow: [number, number, number] = [186, 186, 190];
  const bg = hexToRgb(spec.bg);
  const label = hexToRgb(spec.label);
  const accent = hexToRgb(spec.accent);
  const stripe = hexToRgb(spec.stripe);

  const bodyWidth =
    spec.shape === "can" ? size * 0.42 : spec.shape === "bottle" ? size * 0.34 : spec.shape === "pouch" ? size * 0.48 : size * 0.5;
  const bodyHeight =
    spec.shape === "can" ? size * 0.68 : spec.shape === "bottle" ? size * 0.78 : spec.shape === "pouch" ? size * 0.66 : size * 0.62;
  const left = (size - bodyWidth) / 2;
  const top = (size - bodyHeight) / 2;
  const radius = spec.shape === "can" ? bodyWidth / 2 : Math.min(bodyWidth, bodyHeight) * 0.12;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      // soft background with a top-down gradient + vignette
      const vignette = 1 - 0.12 * Math.hypot(x - size / 2, y - size / 2) / (size / 1.3);
      const t = y / size;
      data[i] = (surface[0] * (1 - t) + shadow[0] * t) * vignette;
      data[i + 1] = (surface[1] * (1 - t) + shadow[1] * t) * vignette;
      data[i + 2] = (surface[2] * (1 - t) + shadow[2] * t) * vignette;

      const dx = Math.abs(x - size / 2);
      const dy = Math.abs(y - size / 2);
      const insideBody =
        x >= left && x <= left + bodyWidth && y >= top && y <= top + bodyHeight;
      const rounded =
        insideBody &&
        !(
          (x < left + radius || x > left + bodyWidth - radius) &&
          (y < top + radius || y > top + bodyHeight - radius) &&
          Math.hypot(
            Math.max(left + radius - x, x - (left + bodyWidth - radius), 0),
            Math.max(top + radius - y, y - (top + bodyHeight - radius), 0),
          ) > radius
        );

      if (rounded) {
        const localY = (y - top) / bodyHeight;
        const localX = (x - left) / bodyWidth;
        let color: [number, number, number] = bg;

        // label band across the middle third
        if (localY > 0.3 && localY < 0.72) color = label;
        // accent stripes
        if (localY > 0.74 && localY < 0.8) color = accent;
        if (localY > 0.2 && localY < 0.24) color = stripe;
        if (spec.shape === "pouch" && localY > 0.86 && localY < 0.9) color = stripe;
        if (spec.shape === "bottle" && localY < 0.16) color = accent;

        // printed "type" lines inside the label
        if (localY > 0.38 && localY < 0.44 && localX > 0.22 && localX < 0.78) color = accent;
        if (localY > 0.55 && localY < 0.6 && localX > 0.28 && localX < 0.72) color = accent;

        // specular highlight on the left third of the cylinder
        const highlight = 1 + Math.max(0, 0.18 - Math.abs(localX - 0.32) * 0.5) * (1 - localY);
        const edgeShadow = dx > size / 2 - 2 ? 0.8 : 1;
        data[i] = color[0] * highlight * edgeShadow;
        data[i + 1] = color[1] * highlight * edgeShadow;
        data[i + 2] = color[2] * highlight * edgeShadow;
      } else if (dy > size / 2 - 1) {
        /* keep background */
      }
    }
  }

  return { data, width: size, height: size };
}

function specThumbnail(spec: DemoSpec, size = 168) {
  const bg = spec.bg;
  const label = spec.label;
  const accent = spec.accent;
  const stripe = spec.stripe;
  const widthRatio = spec.shape === "can" ? 42 : spec.shape === "bottle" ? 34 : spec.shape === "pouch" ? 48 : 50;
  const heightRatio = spec.shape === "can" ? 68 : spec.shape === "bottle" ? 78 : 64;
  const rx = spec.shape === "can" ? 40 : 12;
  const w = (size * widthRatio) / 100;
  const h = (size * heightRatio) / 100;
  const x = (size - w) / 2;
  const y = (size - h) / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#e9e9e7"/><stop offset="100%" stop-color="#b9b9bd"/>
</linearGradient></defs>
<rect width="${size}" height="${size}" fill="url(#bg)"/>
<rect x="${x + 2}" y="${y + 6}" width="${w}" height="${h}" rx="${rx}" fill="#000" opacity="0.12"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bg}"/>
<rect x="${x}" y="${y + h * 0.3}" width="${w}" height="${h * 0.42}" fill="${label}"/>
<rect x="${x}" y="${y + h * 0.2}" width="${w}" height="${h * 0.04}" fill="${stripe}"/>
<rect x="${x}" y="${y + h * 0.74}" width="${w}" height="${h * 0.06}" fill="${accent}"/>
<rect x="${x + w * 0.22}" y="${y + h * 0.38}" width="${w * 0.56}" height="${h * 0.06}" fill="${accent}"/>
<rect x="${x + w * 0.28}" y="${y + h * 0.55}" width="${w * 0.44}" height="${h * 0.05}" fill="${accent}"/>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export type DemoProduct = {
  spec: DemoSpec;
  descriptor: ProductDescriptor;
  thumbnail: string;
};

export function buildDemoProducts(): DemoProduct[] {
  return DEMO_CATALOG.map((spec) => ({
    spec,
    descriptor: computeDescriptor(renderSpec(spec)),
    thumbnail: specThumbnail(spec),
  }));
}
