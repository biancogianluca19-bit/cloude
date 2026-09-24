import Image from "next/image";
import { site } from "@/data/site";
import { Reveal } from "@/components/ui/Reveal";
import { BookIcon, CapIcon, HeartIcon } from "@/components/icons";
import { eyebrow } from "@/components/ui/styles";

const facts = [
  { Icon: CapIcon, label: "Estudia", value: "Edición en la UBA" },
  { Icon: BookIcon, label: "Libro favorito", value: "Orgullo y prejuicio" },
  { Icon: HeartIcon, label: "No puede faltar", value: "Café mientras hace resúmenes" },
];

export function AboutMel() {
  return (
    <section id="sobre-mel" aria-labelledby="mel-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:px-6 md:py-24">
      <div className="grid items-center gap-12 md:grid-cols-[0.85fr_1.15fr] md:gap-20">
        <Reveal className="relative mx-auto w-full max-w-[340px]">
          {/* Foto tipo polaroid */}
          <div className="rotate-[-3deg] rounded-md bg-white p-3 pb-14 shadow-[var(--shadow-lift)] transition-transform duration-500 hover:rotate-0">
            <div className="relative aspect-square overflow-hidden rounded-sm">
              <Image
                src={site.owner.photo}
                alt="Melina Correa, creadora de Mel In Books, frente a su biblioteca"
                fill
                sizes="(min-width: 768px) 320px, 80vw"
                className="object-cover"
              />
            </div>
            <p className="absolute inset-x-0 bottom-3 text-center font-hand text-3xl text-rose-700">Mel ♡</p>
          </div>
          <span aria-hidden className="washi absolute -top-3 left-1/2 h-7 w-28 -translate-x-1/2 rotate-3" />
        </Reveal>

        <div>
          <Reveal>
            <p className={eyebrow}>Sobre Mel</p>
            <h2 id="mel-title" className="mt-3 text-[2.35rem] leading-[1.02] text-ink md:text-[3.2rem]">
              ¡Hola! Soy <em className="text-rose-600">Mel</em>
            </h2>
            <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-ink-soft">
              <p>
                Me llamo Melina Correa, estudio Edición en la UBA y soy la fundadora de Mel In Books. Hago resúmenes para UBA XXI, el CBC y
                las materias de mi carrera.
              </p>
              <p>Mi objetivo es que estudiar sea más claro, más lindo y menos abrumador.</p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <blockquote className="relative mt-8 rounded-2xl bg-blush-100/70 px-6 py-5">
              <span aria-hidden className="absolute -top-5 left-4 font-serif text-7xl leading-none text-rose-300">
                “
              </span>
              <p className="font-serif text-[1.55rem] italic leading-snug text-rose-800">
                Cada resumen que creo es uno que me hubiera gustado tener cuando empecé la carrera.
              </p>
            </blockquote>
          </Reveal>

          <ul className="mt-8 divide-y divide-line rounded-2xl border border-line bg-cream sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {facts.map(({ Icon, label, value }, i) => (
              <Reveal as="li" key={label} delay={200 + i * 70} className="flex items-center gap-3 p-4 sm:block">
                <Icon size={20} className="shrink-0 text-rose-600" />
                <div className="sm:mt-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">{label}</p>
                  <p className="mt-0.5 text-[15px] font-medium text-ink">{value}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
