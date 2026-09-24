import Image from "next/image";
import type { Product } from "@/data/catalog";

export function coverAlt(product: Product): string {
  const who = product.catedra ? `, cátedra ${product.catedra}` : "";
  return `Portada de ${product.title}${who} (Mel In Books)`;
}

/** Portada en un marco de papel, siempre con la misma proporción. */
export function ProductCover({
  product,
  sizes,
  priority = false,
  className = "",
}: {
  product: Product;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-blush-50 ring-1 ring-line ${className}`}>
      <Image
        src={product.cover}
        alt={coverAlt(product)}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain"
      />
    </div>
  );
}
