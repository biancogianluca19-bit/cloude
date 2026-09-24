"use client";

import { track as vercelTrack } from "@vercel/analytics";

/**
 * Eventos que mide el sitio. Se envían a todas las herramientas que estén
 * activas (Vercel Web Analytics, Plausible y/o Google Analytics).
 * Ninguna guarda datos personales: solo qué material se miró o se pidió.
 */
export type AnalyticsEvent =
  | { name: "catalog_view"; props?: { program?: string } }
  | { name: "search"; props: { query: string; results: number } }
  | { name: "search_no_results"; props: { query: string } }
  | { name: "product_view"; props: { product: string } }
  | { name: "add_to_order"; props: { product: string; option: string } }
  | { name: "whatsapp_order"; props: { items: number; products: string } }
  | { name: "whatsapp_single"; props: { product: string; option: string } }
  | { name: "whatsapp_consult"; props: { source: string; query?: string } };

type Props = Record<string, string | number>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props }) => void;
    gtag?: (command: "event", event: string, params?: Props) => void;
  }
}

export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  const props = (event.props ?? {}) as Props;
  try {
    vercelTrack(event.name, props);
    window.plausible?.(event.name, { props });
    window.gtag?.("event", event.name, props);
  } catch {
    // La analítica nunca debe romper una compra.
  }
}
