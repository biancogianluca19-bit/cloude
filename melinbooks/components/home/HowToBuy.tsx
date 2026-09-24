import { site } from "@/data/site";
import { getProduct, toOrderLine } from "@/lib/products";
import { buildOrderMessage } from "@/lib/whatsapp";
import { Reveal } from "@/components/ui/Reveal";
import { WhatsAppText } from "@/components/order/WhatsAppText";
import { SectionHeading } from "./SectionHeading";

const steps = [
  { title: "Buscá tu materia", text: "Por nombre, sigla o cátedra. Si cursás Edición, también podés ir por año." },
  { title: "Elegí qué necesitás", text: "Un parcial, el combo con los dos o el final. Podés sumar varias materias." },
  { title: "Enviá el pedido por WhatsApp", text: "Tocás “Pedir por WhatsApp” y el mensaje para Mel ya está escrito." },
  { title: "Pagá y recibí tu PDF", text: `${site.payment.summary} ${site.delivery.summary}` },
];

function sampleMessage(): string {
  const product = getProduct("semiologia-verzero");
  const option = product?.options.find((o) => o.id === "combo");
  if (!product || !option) return "";
  return buildOrderMessage([toOrderLine(product, option)], { delivery: "WhatsApp" });
}

export function HowToBuy() {
  const message = sampleMessage();
  return (
    <section id="como-comprar" aria-labelledby="como-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:px-6 md:py-24">
      <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-start md:gap-16">
        <div>
          <SectionHeading id="como-title" kicker="Cómo comprar" title={<>Cuatro pasos y <em className="text-rose-600">a estudiar</em></>} />
          <ol className="mt-10 space-y-2">
            {steps.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 90} className="ruled flex gap-5 rounded-2xl border border-line bg-cream p-5 pl-4">
                <span className="w-12 shrink-0 text-center font-serif text-5xl font-semibold leading-none text-rose-300" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-serif text-[1.45rem] leading-tight text-ink">{step.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal delay={200} className="md:sticky md:top-28">
          <figure className="relative mx-auto max-w-sm rotate-[1.5deg] rounded-[28px] bg-[#efe6dd] p-4 shadow-[var(--shadow-lift)]">
            <span aria-hidden className="washi absolute -top-3 left-8 h-6 w-24 -rotate-6" />
            <div className="flex items-center gap-3 rounded-2xl bg-[#2a1520] px-4 py-3 text-cream">
              <span className="grid size-9 place-items-center rounded-full bg-rose-400 font-serif text-lg font-semibold">M</span>
              <div className="text-sm leading-tight">
                <p className="font-medium">Mel In Books</p>
                <p className="text-xs text-blush-200/80">WhatsApp</p>
              </div>
            </div>
            <div className="mt-4 ml-auto w-[88%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-[#dcf5d6] p-3.5 text-[13.5px] leading-relaxed text-[#1f2a1f] shadow-sm">
              <WhatsAppText text={message} />
            </div>
            <figcaption className="mt-4 text-center font-hand text-2xl text-rose-700">Así le llega tu pedido a Mel</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
