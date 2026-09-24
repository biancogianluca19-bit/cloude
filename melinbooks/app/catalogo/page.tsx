import type { Metadata } from "next";
import { programs, type ProgramId } from "@/data/catalog";
import { productCount } from "@/lib/products";
import { CatalogBrowser } from "@/components/catalog/CatalogBrowser";
import { eyebrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "Catálogo de resúmenes",
  description:
    "Resúmenes de UBA XXI (Sociales, Medicina, Derecho y Económicas), CBC y Edición (FILO): IPC, ICSE, Semiología, Sociología, Psicología y más. Buscá por materia o cátedra.",
  alternates: { canonical: "/catalogo" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const programParam = first(params.programa);
  const program = programs.find((p) => p.id === programParam);
  const groupParam = first(params.grupo);
  const group = program?.groups.some((g) => g.id === groupParam) ? groupParam : "";

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
          <CatalogBrowser
            initial={{ q: first(params.q).slice(0, 80), program: (program?.id ?? "") as ProgramId | "", group }}
            autoFocus={first(params.buscar) === "1"}
          />
        </div>
      </div>
    </div>
  );
}
