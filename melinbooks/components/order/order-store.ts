"use client";

import { products } from "@/data/catalog";

export type OrderItem = { slug: string; optionId: string };
export type OrderDetails = { name: string; delivery: string; comment: string };
export type OrderState = { items: OrderItem[]; details: OrderDetails };

const STORAGE_KEY = "melinbooks:pedido:v1";
const EMPTY: OrderState = { items: [], details: { name: "", delivery: "WhatsApp", comment: "" } };

let state: OrderState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

/** Descarta materiales u opciones que ya no existen en el catálogo. */
function sanitize(raw: unknown): OrderState {
  if (!raw || typeof raw !== "object") return EMPTY;
  const data = raw as Partial<OrderState>;
  const items = Array.isArray(data.items)
    ? data.items.filter(
        (i): i is OrderItem =>
          !!i &&
          typeof i.slug === "string" &&
          typeof i.optionId === "string" &&
          products.some((p) => p.slug === i.slug && p.options.some((o) => o.id === i.optionId)),
      )
    : [];
  const d = data.details ?? EMPTY.details;
  return {
    items,
    details: {
      name: typeof d.name === "string" ? d.name : "",
      delivery: typeof d.delivery === "string" ? d.delivery : EMPTY.details.delivery,
      comment: typeof d.comment === "string" ? d.comment : "",
    },
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) state = sanitize(JSON.parse(saved));
  } catch {
    // Navegación privada o almacenamiento bloqueado: el pedido vive solo en memoria.
  }
}

function set(next: OrderState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ídem: no pasa nada si no se puede guardar.
  }
  listeners.forEach((l) => l());
}

export const orderStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        state = sanitize(e.newValue ? JSON.parse(e.newValue) : null);
      } catch {
        state = EMPTY;
      }
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): OrderState {
    load();
    return state;
  },
  getServerSnapshot(): OrderState {
    return EMPTY;
  },

  /** Devuelve false si ese material con esa opción ya estaba en el pedido. */
  add(item: OrderItem): boolean {
    if (state.items.some((i) => i.slug === item.slug && i.optionId === item.optionId)) return false;
    set({ ...state, items: [...state.items, item] });
    return true;
  },
  remove(index: number) {
    set({ ...state, items: state.items.filter((_, i) => i !== index) });
  },
  changeOption(index: number, optionId: string) {
    const items = state.items.map((item, i) => (i === index ? { ...item, optionId } : item));
    // Si al cambiar queda repetido, se deja uno solo.
    const unique = items.filter(
      (item, i) => items.findIndex((x) => x.slug === item.slug && x.optionId === item.optionId) === i,
    );
    set({ ...state, items: unique });
  },
  /** Reemplaza 1.er + 2.º parcial de un mismo material por la opción indicada (combo). */
  replaceWith(slug: string, optionId: string) {
    const first = state.items.findIndex((i) => i.slug === slug);
    const rest = state.items.filter((i) => i.slug !== slug);
    rest.splice(Math.max(first, 0), 0, { slug, optionId });
    set({ ...state, items: rest });
  },
  setDetails(details: Partial<OrderDetails>) {
    set({ ...state, details: { ...state.details, ...details } });
  },
  clear() {
    set({ ...state, items: [] });
  },
};
