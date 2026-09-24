import { faqs } from "@/data/faq";
import { site } from "@/data/site";
import { Reveal } from "@/components/ui/Reveal";
import { WhatsAppIcon } from "@/components/icons";
import { btn, eyebrow } from "@/components/ui/styles";
import { buildHelloMessage, waLink } from "@/lib/whatsapp";

export function Faq() {
  return (
    <section id="preguntas" aria-labelledby="faq-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:px-6 md:py-24">
      <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <Reveal className="md:sticky md:top-28 md:self-start">
          <p className={eyebrow}>Preguntas frecuentes</p>
          <h2 id="faq-title" className="mt-3 text-[2.35rem] leading-[1.02] text-ink md:text-[3.2rem]">
            Todo lo que <em className="text-rose-600">te preguntás</em>
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">¿Te quedó alguna duda? Escribile a Mel.</p>
          <a href={waLink(site.whatsapp.number, buildHelloMessage())} target="_blank" rel="noopener noreferrer" className={`${btn.secondary} mt-6`}>
            <WhatsAppIcon size={18} /> Hacer una consulta
          </a>
        </Reveal>

        <Reveal delay={100}>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((faq) => (
              <details key={faq.question} className="accordion group">
                <summary className="flex items-center justify-between gap-4 py-5 text-left">
                  <h3 className="font-serif text-[1.35rem] font-semibold leading-snug text-ink transition-colors group-hover:text-rose-700 md:text-2xl">
                    {faq.question}
                  </h3>
                  <span
                    aria-hidden
                    className="chev grid size-9 shrink-0 place-items-center rounded-full border border-line text-xl leading-none text-rose-600 group-open:border-rose-600 group-open:bg-rose-600 group-open:text-white"
                  >
                    +
                  </span>
                </summary>
                <div className="space-y-3 pb-6 pr-12 text-[16px] leading-relaxed text-ink-soft">
                  {faq.answer.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
