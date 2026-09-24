"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { products, programs, type Product, type ProgramId } from "@/data/catalog";
import { site } from "@/data/site";
import { searchProducts } from "@/lib/search";
import { mainListing, getProgram } from "@/lib/products";
import { buildNotFoundMessage, waLink } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { pluralize } from "@/lib/format";
import { BookIcon, CloseIcon, SearchIcon, WhatsAppIcon } from "@/components/icons";
import { btn, chip } from "@/components/ui/styles";
import { ProductCard } from "./ProductCard";

const RECENT_KEY = "melinbooks:busquedas";

type Filters = { q: string; program: ProgramId | ""; group: string };

type Section = { id: string; title: string; description?: string; items: Product[] };

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string): string[] {
  const q = query.trim();
  const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento, simplemente no se recuerdan.
  }
  return next;
}

function inProgram(p: Product, program: ProgramId | "", group: string) {
  if (!program) return true;
  return p.listings.some((l) => l.program === program && (!group || l.group === group));
}

/** Arma las secciones cuando no hay búsqueda escrita. */
function browseSections(program: ProgramId | "", group: string): Section[] {
  if (!program) {
    // Vista general: cada material una sola vez, en su programa principal.
    return programs.map((p) => ({
      id: p.id,
      title: p.name,
      description: p.description,
      items: products.filter((x) => mainListing(x).program === p.id),
    }));
  }
  const prog = getProgram(program);
  return prog.groups
    .filter((g) => !group || g.id === group)
    .map((g) => ({
      id: `${prog.id}-${g.id}`,
      title: g.name,
      items: products.filter((x) => x.listings.some((l) => l.program === prog.id && l.group === g.id)),
    }))
    .filter((s) => s.items.length > 0);
}

export function CatalogBrowser({ initial, autoFocus }: { initial: Filters; autoFocus: boolean }) {
  const [filters, setFilters] = useState<Filters>(initial);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { q, program, group } = filters;
  const query = q.trim();

  const results = useMemo(
    () => (query ? searchProducts(products.filter((p) => inProgram(p, program, group)), programs, query) : []),
    [query, program, group],
  );
  const resultsEverywhere = useMemo(
    () => (query && program && results.length === 0 ? searchProducts(products, programs, query).length : 0),
    [query, program, results.length],
  );
  const sections = useMemo(() => (query ? [] : browseSections(program, group)), [query, program, group]);
  const activeProgram = program ? getProgram(program) : null;

  // Estado en la URL (para compartir o volver atrás) sin recargar la página.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (program) params.set("programa", program);
    if (group) params.set("grupo", group);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/catalogo?${qs}` : "/catalogo");
  }, [query, program, group]);

  useEffect(() => {
    // Se lee después de montar para no desincronizar el HTML del servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent());
    track({ name: "catalog_view", props: initial.program ? { program: initial.program } : undefined });
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, initial.program]);

  // Medición de búsquedas (con pausa, para no contar cada letra).
  useEffect(() => {
    if (!query) return;
    const t = setTimeout(() => {
      if (results.length > 0) {
        track({ name: "search", props: { query, results: results.length } });
        setRecent(saveRecent(query));
      } else {
        track({ name: "search_no_results", props: { query } });
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [query, results.length]);

  const setProgram = (next: ProgramId | "") => setFilters((f) => ({ ...f, program: next, group: "" }));
  const setGroup = (next: string) => setFilters((f) => ({ ...f, group: f.group === next ? "" : next }));
  const setQuery = (next: string) => setFilters((f) => ({ ...f, q: next }));

  const resultKey = `${query}|${program}|${group}`;

  return (
    <div>
      {/* Barra de búsqueda y filtros, fija arriba al hacer scroll */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-paper/95 px-4 pb-3 pt-3 backdrop-blur-md md:top-[72px] md:mx-0 md:rounded-b-3xl md:px-0">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            inputRef.current?.blur();
          }}
        >
          <label htmlFor="catalog-search" className="sr-only">
            Buscá por materia, sigla o cátedra
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-cream px-3 shadow-[var(--shadow-paper)] transition focus-within:border-rose-400 focus-within:shadow-[0_0_0_4px_rgb(247_207_219/0.7)]">
            <SearchIcon size={22} className="shrink-0 text-rose-600" />
            <input
              ref={inputRef}
              id="catalog-search"
              type="search"
              value={q}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Materia, sigla o cátedra: IPC, Perot, Edición…"
              className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-soft/70 focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-blush-100"
                aria-label="Borrar búsqueda"
              >
                <CloseIcon size={18} />
              </button>
            )}
          </div>
        </form>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Programa">
          <button type="button" className={chip} aria-pressed={program === ""} onClick={() => setProgram("")}>
            Todo
          </button>
          {programs.map((p) => (
            <button key={p.id} type="button" className={chip} aria-pressed={program === p.id} onClick={() => setProgram(p.id)}>
              {p.name}
            </button>
          ))}
        </div>

        {activeProgram && (
          <div
            key={activeProgram.id}
            className="no-scrollbar -mx-4 mt-2 flex animate-fade-up items-center gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
            role="group"
            aria-label={activeProgram.groupLabel}
          >
            <span className="shrink-0 text-xs text-ink-soft">{activeProgram.groupLabel}:</span>
            {activeProgram.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={group === g.id}
                onClick={() => setGroup(g.id)}
                className="h-8 shrink-0 rounded-full border border-dashed border-rose-400/60 px-3 text-[13px] text-rose-800 transition hover:border-rose-600 aria-pressed:border-solid aria-pressed:border-rose-600 aria-pressed:bg-blush-100"
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sugerencias cuando no hay búsqueda */}
      {!query && (
        <div className="mt-5 space-y-2 text-sm">
          {recent.length > 0 && (
            <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              <span className="shrink-0 text-ink-soft">Buscaste:</span>
              {recent.map((r) => (
                <button key={r} type="button" onClick={() => setQuery(r)} className={chip}>
                  {r}
                </button>
              ))}
            </div>
          )}
          <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <span className="shrink-0 text-ink-soft">Lo más buscado:</span>
            {site.popularSearches.map((s) => (
              <button key={s} type="button" onClick={() => setQuery(s)} className={chip}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {query ? (results.length ? `${pluralize(results.length, "resultado", "resultados")} para ${query}` : `Sin resultados para ${query}`) : ""}
      </p>

      <div key={resultKey} className="mt-8">
        {query ? (
          results.length > 0 ? (
            <>
              <h2 className="font-serif text-2xl text-ink">
                {pluralize(results.length, "resultado", "resultados")} para <em className="text-rose-600">«{query}»</em>
              </h2>
              <ul className="mt-5 grid gap-3 md:grid-cols-2">
                {results.map((p, i) => (
                  <li key={p.slug}>
                    <ProductCard product={p} index={i} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              query={query}
              elsewhere={resultsEverywhere}
              onSearchEverywhere={() => setFilters((f) => ({ ...f, program: "", group: "" }))}
            />
          )
        ) : (
          <div className="space-y-14">
            {sections.map((section) => (
              <section key={section.id} aria-labelledby={`sec-${section.id}`}>
                <div className="flex items-baseline gap-3">
                  <h2 id={`sec-${section.id}`} className="shrink-0 font-serif text-[2rem] leading-none text-ink">
                    {section.title}
                  </h2>
                  <span aria-hidden className="leader" />
                  <span className="shrink-0 font-hand text-xl text-rose-700">{pluralize(section.items.length, "material", "materiales")}</span>
                </div>
                {section.description && <p className="mt-2 max-w-2xl text-[15px] text-ink-soft">{section.description}</p>}
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {section.items.map((p, i) => (
                    <li key={p.slug}>
                      <ProductCard product={p} index={i} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {(!query || results.length > 0) && (
        <div className="mt-14 flex flex-col items-start gap-4 rounded-3xl border border-dashed border-rose-400/60 bg-blush-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif text-2xl leading-tight text-ink">
            ¿No está lo que buscás? <span className="block font-sans text-[15px] text-ink-soft">Mel puede tenerlo aunque no esté publicado.</span>
          </p>
          <a
            href={waLink(site.whatsapp.number, buildNotFoundMessage(query))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track({ name: "whatsapp_consult", props: { source: "catalogo", query } })}
            className={btn.secondary}
          >
            <WhatsAppIcon size={18} /> Consultarle a Mel
          </a>
        </div>
      )}
    </div>
  );
}

function EmptyState({ query, elsewhere, onSearchEverywhere }: { query: string; elsewhere: number; onSearchEverywhere: () => void }) {
  return (
    <div className="mx-auto max-w-lg animate-fade-up py-8 text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-blush-100 text-rose-600">
        <BookIcon size={34} />
      </span>
      <h2 className="mt-6 font-serif text-[2rem] leading-tight text-ink">
        Todavía no encontramos <em className="text-rose-600">«{query}»</em>
      </h2>
      {elsewhere > 0 ? (
        <>
          <p className="mt-3 text-[16px] text-ink-soft">Hay {pluralize(elsewhere, "resultado", "resultados")} en otros programas.</p>
          <button type="button" onClick={onSearchEverywhere} className={`${btn.primary} mt-6`}>
            Buscar en todo el catálogo
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
            Puede que Mel lo tenga aunque no esté publicado, o que te pueda armar un resumen personalizado. Escribile y te responde.
          </p>
          <a
            href={waLink(site.whatsapp.number, buildNotFoundMessage(query))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track({ name: "whatsapp_consult", props: { source: "sin-resultados", query } })}
            className={`${btn.primary} mt-6`}
          >
            <WhatsAppIcon size={20} /> Consultarle a Mel
          </a>
          <p className="mt-4 text-sm text-ink-soft">Tip: probá con la sigla (IPC, ICSE) o con el apellido de la cátedra.</p>
        </>
      )}
    </div>
  );
}
