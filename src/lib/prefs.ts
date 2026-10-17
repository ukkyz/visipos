"use client";

import { useSyncExternalStore } from "react";

export type Prefs = {
  threshold: number;
  cashier: string;
};

const STORAGE_KEY = "visipos:prefs";
const DEFAULTS: Prefs = { threshold: 0.66, cashier: "Cashier" };

let cache: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(): Prefs {
  if (loaded) return cache;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      cache = {
        threshold:
          typeof parsed.threshold === "number" && Number.isFinite(parsed.threshold)
            ? Math.min(0.95, Math.max(0.2, parsed.threshold))
            : DEFAULTS.threshold,
        cashier:
          typeof parsed.cashier === "string" && parsed.cashier.trim() ? parsed.cashier : DEFAULTS.cashier,
      };
    }
  } catch {
    /* storage may be unavailable (private mode / SSR) */
  }
  return cache;
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

export function updatePrefs(patch: Partial<Prefs>) {
  cache = { ...read(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore persistence failures */
  }
  listeners.forEach((listener) => listener());
}
