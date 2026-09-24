import { site } from "@/data/site";
import { Reveal } from "@/components/ui/Reveal";
import { SparkleIcon } from "@/components/icons";

export function Promos() {
  const { multiSubject } = site.promos;
  const notes: readonly string[] = site.promos.notes;
  if (!multiSubject.enabled && notes.length === 0) return null;
  return (
    <section aria-label="Descuentos" className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <Reveal className="relative overflow-hidden rounded-[28px] border border-line bg-cream p-6 md:flex md:items-center md:gap-10 md:p-10">
        <span aria-hidden className="washi absolute -left-4 top-6 h-7 w-28 -rotate-12" />
        {multiSubject.enabled && (
          <p className="shrink-0 text-center md:text-left">
            <span className="block font-serif text-[5.5rem] font-semibold leading-[0.8] text-rose-600">
              {multiSubject.percent}%
              <SparkleIcon className="ml-1 inline-block animate-twinkle align-top text-gold" size={22} />
            </span>
            <span className="mt-2 block font-hand text-2xl text-rose-700">de descuento</span>
          </p>
        )}
        <div className="mt-6 md:mt-0">
          {multiSubject.enabled && (
            <p className="font-serif text-2xl leading-snug text-ink md:text-3xl">
              Comprando {multiSubject.minSubjects} o más materias el mismo día.
            </p>
          )}
          <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
            {notes.map((n) => (
              <li key={n} className="flex gap-2">
                <span aria-hidden className="text-rose-400">✦</span>
                {n}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
