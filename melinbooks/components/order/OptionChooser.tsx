"use client";

import type { Product } from "@/data/catalog";
import { formatPrice } from "@/lib/format";
import { CheckIcon } from "@/components/icons";

/** Lista de opciones de compra (1.er parcial, combo, final...) como botones de radio. */
export function OptionChooser({
  product,
  value,
  onChange,
  name,
}: {
  product: Product;
  value: string;
  onChange: (optionId: string) => void;
  name: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Elegí qué necesitás</legend>
      {product.options.map((option) => {
        const checked = option.id === value;
        return (
          <label
            key={option.id}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition duration-200 ${
              checked
                ? "border-rose-600 bg-blush-50 shadow-[0_0_0_3px_rgb(247_207_219/0.7)]"
                : "border-line bg-cream hover:border-rose-400"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={checked}
              onChange={() => onChange(option.id)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={`grid size-5 shrink-0 place-items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-rose-600 peer-focus-visible:ring-offset-2 ${
                checked ? "border-rose-600 bg-rose-600 text-white" : "border-rose-400/60 bg-white"
              }`}
            >
              {checked && <CheckIcon size={13} strokeWidth={2.6} />}
            </span>
            <span className="flex-1 text-[15px] text-ink">{option.label}</span>
            <span className="font-serif text-lg font-semibold text-rose-800">
              {option.price === undefined ? "A consultar" : formatPrice(option.price)}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
