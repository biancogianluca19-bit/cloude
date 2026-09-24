import Link from "next/link";
import { btn } from "@/components/ui/styles";
import { BookIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-blush-100 text-rose-600">
        <BookIcon size={34} />
      </span>
      <p className="mt-6 font-hand text-2xl text-rose-700">Página 404</p>
      <h1 className="mt-1 text-5xl leading-tight text-ink">Esta página se perdió entre los libros</h1>
      <p className="mt-4 text-ink-soft">Puede que el link esté mal escrito o que el material ya no esté publicado.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/catalogo" className={btn.primary}>
          Ir al catálogo
        </Link>
        <Link href="/" className={btn.secondary}>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
