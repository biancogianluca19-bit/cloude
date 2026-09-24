"use client";

import Link from "next/link";
import type { Product } from "@/data/catalog";
import { ProductCover } from "@/components/ProductCover";
import { AddToOrderButton } from "@/components/order/AddToOrderButton";
import { useOrder } from "@/components/order/OrderProvider";
import { CheckIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { priceRange, programLabel } from "@/lib/products";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { lines } = useOrder();
  const inOrder = lines.some((l) => l.product.slug === product.slug);
  const range = priceRange(product);

  const meta = [
    product.catedra ? `Cátedra ${product.catedra}` : product.catedraNote,
    product.catedra && product.catedraNote ? product.catedraNote : undefined,
    product.pages ? `${product.pages} págs.` : undefined,
  ].filter(Boolean);

  return (
    <article
      className="result-in group relative flex gap-3.5 rounded-2xl border border-line bg-cream p-3 transition duration-300 hover:-translate-y-0.5 hover:border-blush-300 hover:shadow-[var(--shadow-paper)] sm:p-3.5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <ProductCover product={product} sizes="(min-width: 640px) 144px, 112px" className="w-28 shrink-0 self-start sm:w-36" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-rose-700">{programLabel(product)}</p>
        <h3 className="mt-0.5 font-serif text-[1.4rem] font-semibold leading-[1.1] text-ink">
          <Link
            href={`/resumen/${product.slug}`}
            className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none group-has-[a:focus-visible]:underline"
          >
            {product.subject}
          </Link>
        </h3>
        {product.subject !== product.title && <p className="line-clamp-2 text-[13px] leading-snug text-ink-soft">{product.title}</p>}
        {meta.length > 0 && <p className="mt-1 text-[13px] text-ink-soft">{meta.join(" · ")}</p>}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="leading-none">
            {range ? (
              <>
                {range.min !== range.max && <span className="block text-[11px] text-ink-soft">desde</span>}
                <span className="font-serif text-xl font-semibold text-rose-800">{formatPrice(range.min)}</span>
              </>
            ) : (
              <span className="text-sm text-ink-soft">{product.kind === "servicio" ? "Consultá" : "Precio a consultar"}</span>
            )}
          </p>
          <div className="relative z-10 flex items-center gap-2">
            {inOrder && (
              <span className="flex items-center gap-1 text-xs font-medium text-rose-700" title="Ya está en tu pedido">
                <CheckIcon size={14} strokeWidth={2.4} />
                <span className="hidden min-[380px]:inline">En tu pedido</span>
              </span>
            )}
            <AddToOrderButton product={product} />
          </div>
        </div>
      </div>
    </article>
  );
}
