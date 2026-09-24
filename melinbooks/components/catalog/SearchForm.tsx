import { SearchIcon } from "@/components/icons";

/**
 * Buscador de la home. Es un formulario común: funciona aunque falle el
 * JavaScript y lleva a /catalogo?q=...
 */
export function SearchForm({ id = "hero-search" }: { id?: string }) {
  return (
    <form action="/catalogo" method="get" role="search" className="group relative">
      <label htmlFor={id} className="sr-only">
        Buscá tu materia
      </label>
      <div className="flex items-center gap-2 rounded-[22px] border border-line bg-cream p-2 shadow-[var(--shadow-paper)] transition focus-within:border-rose-400 focus-within:shadow-[0_0_0_4px_rgb(247_207_219/0.7),var(--shadow-paper)]">
        <SearchIcon size={22} className="ml-2.5 shrink-0 text-rose-600" />
        <input
          id={id}
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="IPC, ICSE, Semiología…"
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-soft/70 focus:outline-none"
        />
        <button
          type="submit"
          className="hidden h-12 shrink-0 items-center rounded-2xl bg-rose-600 px-5 text-[15px] font-medium text-white transition hover:bg-rose-700 active:scale-[0.97] sm:inline-flex"
        >
          Encontrar mi resumen
        </button>
        <button
          type="submit"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-600 text-white transition hover:bg-rose-700 active:scale-95 sm:hidden"
          aria-label="Buscar"
        >
          <SearchIcon size={20} strokeWidth={2.2} />
        </button>
      </div>
    </form>
  );
}
