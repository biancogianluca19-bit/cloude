import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { products } from "@/data/catalog";
import { site, getSiteUrl } from "@/data/site";
import { describe, getProduct, getProgram, groupName, mainListing, priceRange } from "@/lib/products";
import { ProductCover } from "@/components/ProductCover";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { ProductCard } from "@/components/catalog/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import { Reveal } from "@/components/ui/Reveal";
import { ArrowLeftIcon, CalendarIcon, CapIcon, PageIcon, WalletIcon } from "@/components/icons";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

function pageTitle(slug: string) {
  const p = getProduct(slug);
  if (!p) return "";
  const program = getProgram(mainListing(p).program);
  const catedra = p.catedra ? ` – Cátedra ${p.catedra}` : "";
  const prefix = p.kind === "resumen" ? "Resumen de " : "";
  return `${prefix}${p.subject}${catedra}${program.id === "extras" ? "" : ` (${program.short})`}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  const title = pageTitle(slug);
  const description = describe(product);
  return {
    title,
    description,
    alternates: { canonical: `/resumen/${slug}` },
    openGraph: { title: `${title} | ${site.name}`, description, url: `/resumen/${slug}`, images: [{ url: product.cover, alt: title }] },
    twitter: { card: "summary_large_image", title: `${title} | ${site.name}`, description, images: [product.cover] },
  };
}

const generalIncludes = [
  "Contenidos teóricos desarrollados paso a paso",
  "Esquemas visuales, dibujos explicativos y cuadros comparativos",
  "Tips clave para preparar los parciales",
  "PDF de alta calidad para leer o imprimir",
];

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const listing = mainListing(product);
  const program = getProgram(listing.program);
  const range = priceRange(product);
  const sameSubject = products.filter((p) => p.subject === product.subject && p.slug !== product.slug);
  const related = (
    sameSubject.length > 0
      ? sameSubject
      : products.filter((p) => p.slug !== product.slug && p.listings.some((l) => l.program === listing.program && l.group === listing.group))
  ).slice(0, 4);
  const url = getSiteUrl();

  const facts = [
    product.pages && { Icon: PageIcon, text: `${product.pages} páginas` },
    ...(product.facts ?? []).map((f) => ({ Icon: /20\d\d/.test(f) ? CalendarIcon : CapIcon, text: f })),
  ].filter((x): x is { Icon: typeof PageIcon; text: string } => !!x);

  return (
    <div className="paper-grain">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: pageTitle(slug),
          description: describe(product),
          image: `${url}${product.cover}`,
          brand: { "@type": "Brand", name: site.name },
          category: program.name,
          ...(range && {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "ARS",
              lowPrice: range.min,
              highPrice: range.max,
              offerCount: product.options.filter((o) => o.price !== undefined).length,
              url: `${url}/resumen/${slug}`,
            },
          }),
        }}
      />
      <div className="mx-auto max-w-6xl px-4 pt-6 md:px-6 md:pt-10">
        <nav aria-label="Ruta de navegación" className="text-sm text-ink-soft">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/catalogo" className="inline-flex items-center gap-1 hover:text-rose-700">
                <ArrowLeftIcon size={16} /> Catálogo
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/catalogo?programa=${program.id}`} className="hover:text-rose-700">
                {program.name}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/catalogo?programa=${program.id}&grupo=${listing.group}`} className="hover:text-rose-700">
                {groupName(program.id, listing.group)}
              </Link>
            </li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_1fr] md:gap-14">
          <div className="animate-fade-up">
            <div className="relative rounded-[26px] bg-white p-2.5 shadow-[var(--shadow-lift)] md:rotate-[-1.2deg]">
              <ProductCover product={product} sizes="(min-width: 768px) 520px, 92vw" priority />
              <span aria-hidden className="washi absolute -top-3 left-10 h-6 w-24 -rotate-6" />
            </div>
            {product.gallery && product.gallery.length > 0 && (
              <div className="mt-6 flex gap-3">
                {product.gallery.map((src) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block w-32 overflow-hidden rounded-xl bg-white p-1.5 shadow-[var(--shadow-paper)] transition hover:-translate-y-1"
                  >
                    <Image src={src} alt={`Ficha de ${product.subject}${product.catedra ? ` · ${product.catedra}` : ""}`} width={240} height={340} className="h-auto w-full rounded-lg" />
                    <span className="mt-1.5 block text-center text-xs text-rose-700 group-hover:underline">Ver ficha completa</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="stagger">
            <div className="flex flex-wrap gap-2">
              {product.listings.map((l) => (
                <Link
                  key={`${l.program}-${l.group}`}
                  href={`/catalogo?programa=${l.program}&grupo=${l.group}`}
                  className="rounded-full bg-blush-100 px-3 py-1 text-xs font-medium text-rose-800 hover:bg-blush-200"
                >
                  {getProgram(l.program).short} · {groupName(l.program, l.group)}
                </Link>
              ))}
            </div>
            <h1 className="mt-4 text-[2.9rem] leading-[0.95] text-ink md:text-6xl">
              {product.subject}
              {product.catedra && (
                <span className="mt-2 block text-[1.6rem] font-medium italic text-rose-600 md:text-3xl">
                  Cátedra {product.catedra}
                  {product.catedraNote && <span className="text-ink-soft"> · {product.catedraNote}</span>}
                </span>
              )}
              {!product.catedra && product.catedraNote && (
                <span className="mt-2 block text-[1.6rem] font-medium italic text-rose-600 md:text-3xl">{product.catedraNote}</span>
              )}
            </h1>
            {product.subject !== product.title && <p className="mt-3 font-serif text-xl text-ink-soft">{product.title}</p>}
            <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">{describe(product)}</p>

            {facts.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2">
                {facts.map(({ Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-sm text-ink">
                    <Icon size={16} className="text-rose-600" /> {text}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-7">
              <ProductPurchase product={product} />
            </div>
            <p className="mt-4 flex gap-2 text-sm leading-relaxed text-ink-soft">
              <WalletIcon size={18} className="mt-0.5 shrink-0 text-rose-600" />
              <span>
                {site.payment.summary} {site.delivery.summary}
              </span>
            </p>
          </div>
        </div>

        {(product.index || product.kind === "resumen") && (
          <div className="mt-16 grid gap-6 md:grid-cols-2 md:gap-10">
            {product.index && (
              <Reveal className="ruled rounded-3xl border border-line bg-cream p-6 md:p-8">
                <h2 className="text-3xl text-ink">Índice</h2>
                <p className="mt-1 text-sm text-ink-soft">Tal como lo publica Mel. Comparalo con tu programa.</p>
                <ol className="mt-5 space-y-2.5">
                  {product.index.map((item, i) => (
                    <li key={item} className="flex gap-3 text-[15px] leading-snug text-ink">
                      <span className="w-6 shrink-0 text-right font-serif text-lg font-semibold leading-5 text-rose-400">{i + 1}</span>
                      {item}
                    </li>
                  ))}
                </ol>
              </Reveal>
            )}
            {product.kind === "resumen" && (
              <Reveal delay={100} className="rounded-3xl bg-blush-100/70 p-6 md:p-8">
                <h2 className="text-3xl text-ink">Qué incluyen los resúmenes completos</h2>
                <ul className="mt-5 space-y-3">
                  {generalIncludes.map((item) => (
                    <li key={item} className="flex gap-3 text-[15px] text-ink">
                      <span aria-hidden className="text-rose-500">✦</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm text-ink-soft">
                  ¿Querés ver el índice antes de comprar? Pedíselo a Mel por WhatsApp.
                </p>
              </Reveal>
            )}
          </div>
        )}

        {related.length > 0 && (
          <section aria-labelledby="relacionados" className="mt-20">
            <h2 id="relacionados" className="text-[2.2rem] leading-tight text-ink">
              {sameSubject.length > 0 ? (
                <>
                  {product.subject} en <em className="text-rose-600">otras cátedras</em>
                </>
              ) : (
                <>
                  También en <em className="text-rose-600">{groupName(listing.program, listing.group)}</em>
                </>
              )}
            </h2>
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {related.map((p, i) => (
                <li key={p.slug}>
                  <ProductCard product={p} index={i} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
