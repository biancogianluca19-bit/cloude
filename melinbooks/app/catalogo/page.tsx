import type { Metadata } from "next";
import { Suspense } from "react";
import { productCount } from "@/lib/products";
import { CatalogBrowser } from "@/components/catalog/CatalogBrowser";
import { CatalogFromUrl } from "@/components/catalog/CatalogFromUrl";
import { eyebrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "Catálogo de resúmenes",
  description:
    "Resúmenes de UBA XXI (Sociales, Medicina, Derecho y Económicas), CBC y Edición (FILO): IPC, ICSE, Semiología, Sociología, Psicología y más. Buscá por materia o cátedra.",
  alternates: { canonical: "/catalogo" },
};

export default function CatalogPage() {
  return (
    <div className="paper-grain">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 md:px-6 md:pt-12">
        <p className={`${eyebrow} hidden md:block`}>Catálogo</p>
        <h1 className="text-[2.3rem] leading-[0.95] text-ink md:mt-2 md:text-6xl">
          Encontrá <em className="text-rose-600">tu resumen</em>
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft md:mt-3 md:text-[16px]">
          {productCount} materiales para UBA XXI, CBC y Edición (FILO).
        </p>
        <div className="mt-3 md:mt-6">
          {/* La página es estática: la búsqueda de la URL se aplica en el navegador.
              Mientras tanto se muestra el catálogo completo (sirve también para Google). */}
          <Suspense fallback={<CatalogBrowser initial={{ q: "", program: "", group: "" }} autoFocus={false} />}>
            <CatalogFromUrl />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
