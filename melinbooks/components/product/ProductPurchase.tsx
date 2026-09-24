"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/data/catalog";
import { site } from "@/data/site";
import { OptionChooser } from "@/components/order/OptionChooser";
import { useOrder } from "@/components/order/OrderProvider";
import { btn } from "@/components/ui/styles";
import { CheckIcon, PlusIcon, WhatsAppIcon } from "@/components/icons";
import { getOption, toOrderLine } from "@/lib/products";
import { buildInquiryMessage, buildOrderMessage, waLink } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";

export function ProductPurchase({ product }: { product: Product }) {
  const { add, lines, openDrawer } = useOrder();
  const [optionId, setOptionId] = useState(product.options[0]?.id ?? "");
  const option = getOption(product, optionId);
  const inOrder = lines.some((l) => l.product.slug === product.slug && l.option.id === optionId);
  const isService = product.kind === "servicio";

  useEffect(() => {
    track({ name: "product_view", props: { product: product.slug } });
  }, [product.slug]);

  if (!option) return null;
  const line = toOrderLine(product, option);
  const direct = waLink(site.whatsapp.number, isService ? buildInquiryMessage(line) : buildOrderMessage([line]));

  return (
    <div className="rounded-3xl border border-line bg-cream p-5 shadow-[var(--shadow-paper)] md:p-6">
      {isService ? (
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Escribile a Mel para contarle qué necesitás. Te responde por WhatsApp con disponibilidad y precio.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm font-medium text-ink">¿Qué necesitás?</p>
          <OptionChooser product={product} value={optionId} onChange={setOptionId} name={`producto-${product.slug}`} />
        </>
      )}

      <div className="mt-5 grid gap-2">
        {!isService &&
          (inOrder ? (
            <button type="button" onClick={openDrawer} className={`${btn.secondary} h-14`}>
              <CheckIcon size={18} strokeWidth={2.4} /> Ya está en tu pedido · Ver pedido
            </button>
          ) : (
            <button type="button" onClick={() => add(product.slug, optionId)} className={`${btn.primary} h-14 text-base`}>
              <PlusIcon size={20} /> Sumar a mi pedido
            </button>
          ))}
        <a
          href={direct}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            isService
              ? track({ name: "whatsapp_consult", props: { source: "servicio", query: product.slug } })
              : track({ name: "whatsapp_single", props: { product: product.slug, option: optionId } })
          }
          className={isService ? `${btn.primary} h-14 text-base` : btn.ghost}
        >
          <WhatsAppIcon size={isService ? 22 : 18} /> {isService ? "Consultar por WhatsApp" : "Pedir solo esto por WhatsApp"}
        </a>
      </div>
    </div>
  );
}
