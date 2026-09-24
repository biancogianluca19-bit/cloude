"use client";

import { useSearchParams } from "next/navigation";
import { programs, type ProgramId } from "@/data/catalog";
import { CatalogBrowser } from "./CatalogBrowser";

/** Lee la búsqueda y los filtros de la URL (?q=, ?programa=, ?grupo=, ?buscar=1). */
export function CatalogFromUrl() {
  const params = useSearchParams();
  const program = programs.find((p) => p.id === params.get("programa"));
  const groupParam = params.get("grupo") ?? "";
  const group = program?.groups.some((g) => g.id === groupParam) ? groupParam : "";
  return (
    <CatalogBrowser
      initial={{ q: (params.get("q") ?? "").slice(0, 80), program: (program?.id ?? "") as ProgramId | "", group }}
      autoFocus={params.get("buscar") === "1"}
    />
  );
}
