import Link from "next/link";
import { programs } from "@/data/catalog";
import { productsIn } from "@/lib/products";
import { Reveal } from "@/components/ui/Reveal";
import { ArrowRightIcon } from "@/components/icons";
import { SectionHeading } from "./SectionHeading";

const tabColors = ["bg-blush-200", "bg-rose-400/60", "bg-lilac/70", "bg-sage/60"];

export function Programs() {
  return (
    <section aria-labelledby="programas-title" className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <SectionHeading id="programas-title" kicker="Por dónde empezar" title={<>¿Qué estás <em className="text-rose-600">cursando</em>?</>}>
        Elegí tu programa y vas directo a sus materias.
      </SectionHeading>

      <ul className="mt-10 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-5">
        {programs.map((program, i) => {
          const count = productsIn(program.id).length;
          return (
            <Reveal as="li" key={program.id} delay={i * 80}>
              <Link
                href={`/catalogo?programa=${program.id}`}
                className="group relative block h-full rounded-2xl rounded-tl-none border border-line bg-cream p-4 pt-5 shadow-[var(--shadow-paper)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] md:p-6"
              >
                {/* Pestaña de carpeta */}
                <span aria-hidden className={`absolute -top-3 left-[-1px] h-3 w-20 rounded-t-lg ${tabColors[i % tabColors.length]}`} />
                <span className="font-hand text-lg text-rose-700">{count} materiales</span>
                <span className="mt-1 block font-serif text-[1.7rem] font-semibold leading-none text-ink md:text-4xl">{program.short}</span>
                <span className="mt-2 block text-[13px] leading-snug text-ink-soft md:text-sm">{program.description}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-rose-700">
                  Ver materias
                  <ArrowRightIcon size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
