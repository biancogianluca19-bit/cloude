import Image from "next/image";
import { site } from "@/data/site";
import { Reveal } from "@/components/ui/Reveal";
import { BookIcon, ListIcon, PageIcon, PrinterIcon, SparkleIcon, CalendarIcon } from "@/components/icons";

const features = [
  { Icon: BookIcon, title: "Teoría paso a paso", text: "Todos los contenidos teóricos desarrollados en orden." },
  { Icon: ListIcon, title: "Esquemas y cuadros", text: "Esquemas visuales, dibujos explicativos y cuadros comparativos." },
  { Icon: SparkleIcon, title: "Tips para el parcial", text: "Los puntos clave marcados para preparar la evaluación." },
  { Icon: CalendarIcon, title: "Actualizados", text: "Siguen el programa y la bibliografía vigente de cada materia." },
  { Icon: PageIcon, title: "Índice antes de comprar", text: "Mel te muestra qué incluye para que compares con tu programa." },
  { Icon: PrinterIcon, title: "Digital o impreso", text: `${site.delivery.format}, para la compu, la tablet, el celu o para imprimir.` },
];

export function Includes() {
  return (
    <section aria-labelledby="incluye-title" className="relative overflow-hidden bg-rose-700 py-16 text-white md:py-24">
      <div aria-hidden className="absolute inset-0 opacity-[0.07] ruled" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-16 md:px-6">
        <Reveal className="relative order-2 md:order-1">
          <div className="relative rotate-[-2deg] rounded-[26px] bg-cream p-3 shadow-[0_30px_60px_-30px_rgb(58_27_41/0.8)]">
            <Image
              src="/img/materiales.webp"
              alt="Portadas de resúmenes de Mel In Books: materiales académicos, Semiología, IPC e ICSE"
              width={1200}
              height={849}
              sizes="(min-width: 768px) 480px, 92vw"
              className="h-auto w-full rounded-[18px]"
            />
            <span aria-hidden className="washi absolute -top-3 right-10 h-6 w-24 rotate-6 !bg-blush-200/80" />
          </div>
        </Reveal>
        <div className="order-1 md:order-2">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-blush-200">Qué incluye</p>
            <h2 id="incluye-title" className="mt-3 text-[2.35rem] leading-[1.02] text-white md:text-[3.2rem]">
              Resúmenes que <em className="text-blush-200">da gusto</em> abrir
            </h2>
            <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-blush-100">
              Cada resumen está hecho con dedicación, priorizando la comprensión de los conceptos y el respeto por la bibliografía original.
            </p>
          </Reveal>
          <ul className="mt-9 grid gap-x-6 gap-y-6 sm:grid-cols-2">
            {features.map(({ Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 60} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-white">
                  <Icon size={20} />
                </span>
                <div>
                  <h3 className="font-sans text-[15px] font-semibold tracking-normal text-white">{title}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-blush-100">{text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
