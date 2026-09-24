import { testimonials } from "@/data/testimonials";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "./SectionHeading";

/** Solo se muestra si hay opiniones reales cargadas en data/testimonials.ts. */
export function Testimonials() {
  if (testimonials.length === 0) return null;
  return (
    <section id="opiniones" aria-labelledby="opiniones-title" className="bg-blush-50/70 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading id="opiniones-title" kicker="Opiniones" title={<>Lo que dicen <em className="text-rose-600">quienes ya estudiaron</em></>} />
        <ul className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {testimonials.map((t, i) => (
            <Reveal as="li" key={`${t.author}-${i}`} delay={(i % 3) * 80} className="mb-4 break-inside-avoid">
              <figure className="rounded-2xl border border-line bg-cream p-6 shadow-[var(--shadow-paper)]">
                <blockquote className="font-serif text-xl leading-snug text-ink">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-sm text-ink-soft">
                  <span className="font-medium text-rose-700">{t.author}</span>
                  {t.detail && <> · {t.detail}</>}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
