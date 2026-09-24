import Image from "next/image";
import Link from "next/link";
import { site } from "@/data/site";
import { products } from "@/data/catalog";
import { productCount } from "@/lib/products";
import { SearchForm } from "@/components/catalog/SearchForm";
import { ArrowRightIcon, SparkleIcon } from "@/components/icons";
import { btn, chip } from "@/components/ui/styles";

const fan = [
  { slug: "icse-cagnacci", r: -9, x: "left-0 top-10", d: 250 },
  { slug: "iae", r: 7, x: "right-0 top-0", d: 400 },
  { slug: "ipc-paruelo", r: -2, x: "left-[14%] top-[42%]", d: 550 },
];

export function Hero() {
  const cards = fan.map((f) => ({ ...f, product: products.find((p) => p.slug === f.slug)! }));
  return (
    <section className="paper-grain relative overflow-hidden">
      <SparkleIcon className="absolute left-[8%] top-8 animate-twinkle text-rose-400" size={14} />
      <SparkleIcon className="absolute right-[12%] top-[46%] animate-twinkle text-gold [animation-delay:1.2s]" size={18} />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8 md:grid-cols-[1.08fr_0.92fr] md:items-center md:gap-8 md:px-6 md:pb-24 md:pt-14">
        <div className="stagger">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-cream/80 px-3.5 py-1.5 text-[13px] text-rose-800">
            <span className="size-1.5 rounded-full bg-rose-500" aria-hidden /> UBA XXI · CBC · Edición (FILO)
          </p>

          <h1 className="mt-5 text-ink">
            <span className="block text-[3.6rem] leading-[0.9] sm:text-7xl md:text-[5.6rem]">
              Mel <em className="font-medium text-rose-600">In</em> Books
            </span>
            <span className="mt-3 block font-serif text-[1.7rem] font-medium italic leading-tight text-rose-700 sm:text-4xl">
              Resúmenes y material de estudio
            </span>
          </h1>

          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-soft">
            Claros, ordenados y actualizados, hechos por una estudiante de la UBA. Buscá tu materia, armá tu pedido y se
            lo mandás a Mel por WhatsApp.
          </p>

          <div className="mt-7 max-w-lg">
            <SearchForm />
          </div>

          <div className="mt-4 flex max-w-lg flex-wrap gap-2" aria-label="Búsquedas frecuentes">
            {site.popularSearches.slice(0, 6).map((q) => (
              <Link key={q} href={`/catalogo?q=${encodeURIComponent(q)}`} className={chip}>
                {q}
              </Link>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/catalogo?buscar=1" className={`${btn.primary} sm:hidden`}>
              Encontrar mi resumen
            </Link>
            <Link href="/catalogo" className={btn.secondary}>
              Ver catálogo <ArrowRightIcon size={18} />
            </Link>
          </div>
        </div>

        <div className="relative mx-auto h-[330px] w-full max-w-[400px] sm:h-[420px] md:h-[500px] md:max-w-[480px]" aria-hidden>
          {cards.map(({ product, r, x, d }) => (
            <div
              key={product.slug}
              className={`deal absolute w-[68%] ${x}`}
              style={{ "--r": `${r}deg`, "--d": `${d}ms` } as React.CSSProperties}
            >
              <div className="animate-float" style={{ "--r": `${r}deg`, animationDelay: `${d * 3}ms` } as React.CSSProperties}>
                <div className="rounded-2xl bg-white p-2 shadow-[var(--shadow-lift)]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-blush-50">
                    <Image src={product.cover} alt="" fill sizes="(min-width: 768px) 320px, 68vw" priority className="object-contain" />
                  </div>
                </div>
                <span className="washi absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-4deg]" />
              </div>
            </div>
          ))}
          <p className="deal absolute bottom-2 right-2 rotate-[-6deg] font-hand text-2xl text-rose-700 sm:bottom-6 md:text-3xl" style={{ "--d": "800ms", "--r": "-6deg" } as React.CSSProperties}>
            {productCount} materiales ♡
          </p>
        </div>
      </div>
    </section>
  );
}
