export const CURRENCY_SYMBOL = "$";
export const TAX_RATE = 0.08;

export function centsToInputValue(cents: number) {
  return (cents / 100).toFixed(2);
}

export function parsePriceToCents(value: string | number): number {
  if (typeof value === "number") return Math.round(value * 100);
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

export function formatMoney(cents: number, symbol = CURRENCY_SYMBOL) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${symbol}${(absolute / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function computeTotals(subtotalCents: number, discountCents = 0) {
  const taxable = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxable * TAX_RATE);
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: taxable + taxCents,
  };
}
