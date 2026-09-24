"use client";

import type { Product } from "@/data/catalog";
import { site } from "@/data/site";
import { PlusIcon, WhatsAppIcon } from "@/components/icons";
import { toOrderLine } from "@/lib/products";
import { buildInquiryMessage, waLink } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { useOrder } from "./OrderProvider";

/**
 * Botón "Agregar" de las tarjetas. Si el material tiene varias opciones,
 * abre el selector; si es un servicio, abre WhatsApp con la consulta.
 */
export function AddToOrderButton({ product, className = "" }: { product: Product; className?: string }) {
  const { choose } = useOrder();
  const option = product.options[0];

  if (product.kind === "servicio" && option) {
    return (
      <a
        href={waLink(site.whatsapp.number, buildInquiryMessage(toOrderLine(product, option)))}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track({ name: "whatsapp_consult", props: { source: "servicio", query: product.slug } })}
        className={`inline-flex h-10 items-center gap-1.5 rounded-full border border-rose-600/40 px-4 text-sm font-medium text-rose-800 transition hover:border-rose-600 hover:bg-blush-50 active:scale-95 ${className}`}
        aria-label={`Consultar por ${product.title} por WhatsApp`}
      >
        <WhatsAppIcon size={16} /> Consultar
      </a>
    );
  }

  const label = product.catedra ? `${product.subject}, cátedra ${product.catedra}` : product.subject;
  return (
    <button
      type="button"
      onClick={() => choose(product.slug)}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full bg-rose-600 pl-3 pr-4 text-sm font-medium text-white shadow-[0_6px_16px_-8px_rgb(179_76_114/0.8)] transition hover:bg-rose-700 active:scale-95 ${className}`}
      aria-label={`Agregar ${label} a mi pedido`}
    >
      <PlusIcon size={16} strokeWidth={2.2} /> Agregar
    </button>
  );
}
