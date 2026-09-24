"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Product, PurchaseOption } from "@/data/catalog";
import { getOption, getProduct } from "@/lib/products";
import { track } from "@/lib/analytics";
import { orderStore, type OrderDetails } from "./order-store";

export type ResolvedLine = { index: number; product: Product; option: PurchaseOption };

type Toast = { id: number; title: string; detail: string; duplicate: boolean };

type OrderContext = {
  lines: ResolvedLine[];
  details: OrderDetails;
  /** Suma un material al pedido y muestra el aviso. */
  add: (slug: string, optionId: string) => void;
  /** Abre el selector de opción (parcial, combo...) de un material. */
  choose: (slug: string) => void;
  pickerProduct: Product | null;
  closePicker: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toast: Toast | null;
  dismissToast: () => void;
  /** Cambia cada vez que se agrega algo (para animar el contador). */
  bump: number;
};

const Ctx = createContext<OrderContext | null>(null);

export function useOrder(): OrderContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrder tiene que usarse dentro de <OrderProvider>");
  return ctx;
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(orderStore.subscribe, orderStore.getSnapshot, orderStore.getServerSnapshot);
  const [pickerSlug, setPickerSlug] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [bump, setBump] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lines = useMemo(
    () =>
      state.items.flatMap((item, index) => {
        const product = getProduct(item.slug);
        const option = product && getOption(product, item.optionId);
        return product && option ? [{ index, product, option }] : [];
      }),
    [state.items],
  );

  const showToast = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const add = useCallback(
    (slug: string, optionId: string) => {
      const product = getProduct(slug);
      const option = product && getOption(product, optionId);
      if (!product || !option) return;
      const added = orderStore.add({ slug, optionId });
      const title = product.catedra ? `${product.subject} · ${product.catedra}` : product.subject;
      showToast({ title, detail: option.label, duplicate: !added });
      if (added) {
        setBump((b) => b + 1);
        track({ name: "add_to_order", props: { product: slug, option: optionId } });
      }
    },
    [showToast],
  );

  const choose = useCallback(
    (slug: string) => {
      const product = getProduct(slug);
      if (!product) return;
      const only = product.options.length === 1 ? product.options[0] : undefined;
      if (only) add(slug, only.id);
      else setPickerSlug(slug);
    },
    [add],
  );

  const value = useMemo<OrderContext>(
    () => ({
      lines,
      details: state.details,
      add,
      choose,
      pickerProduct: pickerSlug ? (getProduct(pickerSlug) ?? null) : null,
      closePicker: () => setPickerSlug(null),
      drawerOpen,
      openDrawer: () => {
        setToast(null);
        setDrawerOpen(true);
      },
      closeDrawer: () => setDrawerOpen(false),
      toast,
      dismissToast: () => setToast(null),
      bump,
    }),
    [lines, state.details, add, choose, pickerSlug, drawerOpen, toast, bump],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
