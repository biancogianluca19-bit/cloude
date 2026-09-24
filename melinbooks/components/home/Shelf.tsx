import Link from "next/link";
import { subjectShelf } from "@/lib/products";
import { SectionHeading } from "./SectionHeading";
import { Reveal } from "@/components/ui/Reveal";

const spineColors = [
  "bg-rose-400 text-white",
  "bg-blush-200 text-rose-800",
  "bg-lilac text-ink",
  "bg-rose-600 text-white",
  "bg-cream text-rose-800 ring-1 ring-inset ring-line",
  "bg-sage text-ink",
  "bg-blush-300 text-ink",
  "bg-rose-700 text-blush-100",
];

/** Alto del lomo según el largo del nombre, con un poco de variación. */
function spineHeight(name: string, i: number): number {
  return Math.min(236, Math.max(168, 96 + name.length * 9.5)) + ((i * 37) % 3) * 8;
}

/** Las materias como lomos de libros en un estante. */
export function Shelf() {
  const subjects = subjectShelf();
  return (
    <section aria-labelledby="estante-title" className="bg-blush-50/70 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading id="estante-title" kicker="La biblioteca" title={<>Sacá tu materia <em className="text-rose-600">del estante</em></>}>
          Tocá un libro para ver todas sus versiones y cátedras.
          <span className="mt-1 block font-hand text-xl text-rose-700 md:hidden">Deslizá para ver más →</span>
        </SectionHeading>
      </div>

      <Reveal className="mt-10">
        <div className="no-scrollbar overflow-x-auto px-4 md:overflow-visible md:px-6">
          <ul
            className="mx-auto flex w-max md:w-auto md:max-w-6xl md:flex-wrap md:justify-center"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 256px, #d9a8b8 256px 262px, #c68c9f 262px 270px, transparent 270px 286px)",
            }}
          >
            {subjects.map((s, i) => (
              <li key={s.subject} className="flex h-[286px] items-end px-[3px] pb-[30px]">
                <Link
                  href={`/catalogo?q=${encodeURIComponent(s.query)}`}
                  style={{ height: spineHeight(s.subject, i) }}
                  className={`group relative flex w-[54px] flex-col items-center justify-between rounded-t-[6px] rounded-b-[2px] py-3 shadow-[inset_-5px_0_0_rgb(0_0_0/0.06),inset_3px_0_0_rgb(255_255_255/0.25)] transition-transform duration-300 ease-[var(--ease-spring)] hover:-translate-y-3 focus-visible:-translate-y-3 md:w-[60px] ${spineColors[i % spineColors.length]}`}
                  aria-label={`${s.subject}: ${s.count} ${s.count === 1 ? "material" : "materiales"}`}
                >
                  <span aria-hidden className="h-px w-7 bg-current opacity-40" />
                  <span aria-hidden className="rotate-180 whitespace-nowrap font-serif text-[17px] font-semibold tracking-wide [writing-mode:vertical-rl]">
                    {s.subject}
                  </span>
                  <span aria-hidden className="grid size-6 place-items-center rounded-full bg-white/35 text-[11px] font-semibold">
                    {s.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
