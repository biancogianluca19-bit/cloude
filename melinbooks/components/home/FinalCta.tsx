import Link from "next/link";
import { site } from "@/data/site";
import { Reveal } from "@/components/ui/Reveal";
import { WhatsAppIcon, ArrowRightIcon } from "@/components/icons";
import { btn } from "@/components/ui/styles";
import { buildNotFoundMessage, waLink } from "@/lib/whatsapp";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 md:px-6">
      <Reveal className="paper-grain relative overflow-hidden rounded-[32px] border border-line bg-blush-100 px-6 py-14 text-center md:py-20">
        <span aria-hidden className="washi absolute -right-6 top-8 h-7 w-32 rotate-12" />
        <h2 id="cta-title" className="mx-auto max-w-xl text-[2.3rem] leading-[1.05] text-ink md:text-5xl">
          ¿No encontrás <em className="text-rose-600">tu materia</em>?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink-soft">
          Preguntale a Mel. Puede tener material que todavía no está publicado o armarte un resumen personalizado.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={waLink(site.whatsapp.number, buildNotFoundMessage(""))} target="_blank" rel="noopener noreferrer" className={btn.primary}>
            <WhatsAppIcon size={20} /> Consultarle a Mel
          </a>
          <Link href="/catalogo" className={btn.secondary}>
            Ver todo el catálogo <ArrowRightIcon size={18} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
