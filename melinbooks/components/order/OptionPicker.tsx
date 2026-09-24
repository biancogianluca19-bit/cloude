"use client";

import { useState } from "react";
import type { Product } from "@/data/catalog";
import { site } from "@/data/site";
import { Dialog } from "@/components/ui/Dialog";
import { ProductCover } from "@/components/ProductCover";
import { CloseIcon, PlusIcon, WhatsAppIcon } from "@/components/icons";
import { btn } from "@/components/ui/styles";
import { getOption, programLabel, toOrderLine } from "@/lib/products";
import { buildOrderMessage, waLink } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { useOrder } from "./OrderProvider";
import { OptionChooser } from "./OptionChooser";

export function OptionPicker() {
  const { pickerProduct, closePicker } = useOrder();
  return (
    <Dialog open={!!pickerProduct} onClose={closePicker} labelledBy="picker-title" variant="center">
      {pickerProduct && <PickerBody key={pickerProduct.slug} product={pickerProduct} />}
    </Dialog>
  );
}

function PickerBody({ product }: { product: Product }) {
  const { add, closePicker } = useOrder();
  const [optionId, setOptionId] = useState(product.options[0]?.id ?? "");
  const option = getOption(product, optionId);
  const single = option ? waLink(site.whatsapp.number, buildOrderMessage([toOrderLine(product, option)])) : undefined;

  return (
    <>
      <div className="flex items-start gap-4 border-b border-line p-5 pb-4">
        <ProductCover product={product} sizes="112px" className="w-28 shrink-0" />
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-xs uppercase tracking-[0.16em] text-rose-700">{programLabel(product)}</p>
          <h2 id="picker-title" className="mt-1 text-2xl leading-tight text-ink">
            {product.subject}
          </h2>
          {product.catedra && <p className="text-sm text-ink-soft">Cátedra {product.catedra}</p>}
        </div>
        <button
          type="button"
          onClick={closePicker}
          className="-mr-1 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-blush-100"
          aria-label="Cerrar"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="overflow-y-auto p-5">
        <p className="mb-3 text-sm font-medium text-ink">¿Qué necesitás?</p>
        <OptionChooser product={product} value={optionId} onChange={setOptionId} name={`opt-${product.slug}`} />
      </div>

      <div className="grid gap-2 border-t border-line bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className={btn.primary}
          onClick={() => {
            add(product.slug, optionId);
            closePicker();
          }}
        >
          <PlusIcon size={18} /> Sumar a mi pedido
        </button>
        {single && option && (
          <a
            href={single}
            target="_blank"
            rel="noopener noreferrer"
            className={btn.ghost}
            onClick={() => track({ name: "whatsapp_single", props: { product: product.slug, option: option.id } })}
          >
            <WhatsAppIcon size={18} /> Pedir solo esto por WhatsApp
          </a>
        )}
      </div>
    </>
  );
}
