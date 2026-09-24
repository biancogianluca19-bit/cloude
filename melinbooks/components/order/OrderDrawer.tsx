"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { site } from "@/data/site";
import { Dialog } from "@/components/ui/Dialog";
import { btn } from "@/components/ui/styles";
import { BagIcon, BookIcon, CheckIcon, CloseIcon, CopyIcon, TrashIcon, WalletIcon, WhatsAppIcon } from "@/components/icons";
import { coverAlt } from "@/components/ProductCover";
import { formatPrice } from "@/lib/format";
import { programLabel, toOrderLine } from "@/lib/products";
import { buildOrderMessage, orderSubtotal, waLink } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { orderStore } from "./order-store";
import { useOrder, type ResolvedLine } from "./OrderProvider";
import { WhatsAppText } from "./WhatsAppText";

export function OrderDrawer() {
  const { drawerOpen, closeDrawer, lines } = useOrder();
  return (
    <Dialog open={drawerOpen} onClose={closeDrawer} labelledBy="order-title" variant="side">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid size-10 place-items-center rounded-full bg-blush-100 text-rose-700">
          <BagIcon />
        </span>
        <div className="flex-1">
          <h2 id="order-title" className="text-2xl leading-none text-ink">
            Tu pedido
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {lines.length === 0 ? "Vacío por ahora" : `${lines.length} ${lines.length === 1 ? "material" : "materiales"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-blush-100"
          aria-label="Cerrar pedido"
        >
          <CloseIcon />
        </button>
      </div>
      {lines.length === 0 ? <EmptyOrder onClose={closeDrawer} /> : <OrderContent lines={lines} />}
    </Dialog>
  );
}

function EmptyOrder({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-14 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-blush-100 text-rose-600">
        <BookIcon size={28} />
      </span>
      <p className="font-serif text-2xl text-ink">Todavía no sumaste nada.</p>
      <p className="max-w-xs text-sm text-ink-soft">
        Buscá tu materia, elegí la cátedra y lo que necesitás, y va a aparecer acá.
      </p>
      <Link href="/catalogo" onClick={onClose} className={btn.primary}>
        Ir al catálogo
      </Link>
    </div>
  );
}

/** Si alguien sumó los dos parciales y existe un combo más barato, se lo avisamos. */
function comboHint(lines: ResolvedLine[]) {
  const hints: { slug: string; subject: string; comboId: string; comboLabel: string; combo: number; separate: number }[] = [];
  const bySlug = new Map<string, ResolvedLine[]>();
  for (const l of lines) bySlug.set(l.product.slug, [...(bySlug.get(l.product.slug) ?? []), l]);
  for (const [slug, group] of bySlug) {
    const ids = group.map((g) => g.option.id);
    if (!(ids.includes("parcial-1") && ids.includes("parcial-2"))) continue;
    const product = group[0]!.product;
    const combo = product.options.find((o) => o.id === "combo" || o.id === "completo");
    const separate = group.filter((g) => g.option.id.startsWith("parcial")).reduce((s, g) => s + (g.option.price ?? 0), 0);
    if (combo?.price !== undefined && combo.price < separate) {
      hints.push({ slug, subject: product.subject, comboId: combo.id, comboLabel: combo.label, combo: combo.price, separate });
    }
  }
  return hints;
}

function OrderContent({ lines }: { lines: ResolvedLine[] }) {
  const { details } = useOrder();
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const orderLines = useMemo(() => lines.map((l) => toOrderLine(l.product, l.option)), [lines]);
  const subtotal = orderSubtotal(orderLines);
  const subjects = new Set(lines.map((l) => l.product.subject)).size;
  const promo = site.promos.multiSubject;
  const discount = promo.enabled && subjects >= promo.minSubjects ? Math.round((subtotal * promo.percent) / 100) : 0;
  const hasPending = orderLines.some((l) => l.price === undefined);
  const hints = comboHint(lines);

  const message = buildOrderMessage(orderLines, {
    name: details.name,
    delivery: details.delivery,
    comment: details.comment,
    multiSubjectPercent: discount > 0 ? promo.percent : undefined,
  });
  const href = waLink(site.whatsapp.number, message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <ul className="divide-y divide-line px-5">
          {lines.map((line, i) => (
            <li key={`${line.product.slug}-${line.option.id}`} className="result-in flex gap-3 py-4" style={{ "--i": i } as React.CSSProperties}>
              <div className="relative h-14 w-[72px] shrink-0 overflow-hidden rounded-lg bg-blush-50 ring-1 ring-line">
                <Image src={line.product.cover} alt={coverAlt(line.product)} fill sizes="72px" className="object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-semibold leading-tight text-ink">
                      {line.product.subject}
                      {line.product.catedra && <span className="font-normal text-ink-soft"> · {line.product.catedra}</span>}
                    </p>
                    <p className="text-xs text-ink-soft">{programLabel(line.product)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => orderStore.remove(line.index)}
                    className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-blush-100 hover:text-rose-700"
                    aria-label={`Quitar ${line.product.subject} del pedido`}
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {line.product.options.length > 1 ? (
                    <select
                      value={line.option.id}
                      onChange={(e) => orderStore.changeOption(line.index, e.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-full border border-line bg-cream pl-3 pr-1 text-[13px] text-ink focus:border-rose-600"
                      aria-label={`Opción de ${line.product.subject}`}
                    >
                      {line.product.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-sm text-ink">{line.option.label}</span>
                  )}
                  <span className="shrink-0 font-serif text-base font-semibold text-rose-800">
                    {line.option.price === undefined ? "A consultar" : formatPrice(line.option.price)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {hints.map((h) => (
          <div key={h.slug} className="mx-5 mb-3 rounded-2xl border border-dashed border-rose-400 bg-blush-50 p-4 text-sm text-ink">
            <p>
              Sumaste los dos parciales de <strong>{h.subject}</strong>. {h.comboLabel === "Resumen completo" ? "El resumen completo" : "El combo"} sale{" "}
              <strong>{formatPrice(h.combo)}</strong> en vez de {formatPrice(h.separate)}.
            </p>
            <button
              type="button"
              onClick={() => orderStore.replaceWith(h.slug, h.comboId)}
              className="mt-2 font-medium text-rose-700 underline decoration-rose-400 underline-offset-4 hover:text-rose-800"
            >
              Cambiar a {h.comboLabel.toLowerCase()}
            </button>
          </div>
        ))}

        <div className="mx-5 mb-5 space-y-4 rounded-2xl bg-blush-50/70 p-4">
          <div>
            <label htmlFor="order-name" className="text-sm font-medium text-ink">
              Tu nombre <span className="font-normal text-ink-soft">(opcional)</span>
            </label>
            <input
              id="order-name"
              value={details.name}
              onChange={(e) => orderStore.setDetails({ name: e.target.value })}
              autoComplete="given-name"
              className="mt-1.5 h-11 w-full rounded-xl border border-line bg-cream px-3.5 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-rose-600"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink">¿Cómo querés recibirlo?</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {site.delivery.channels.map((channel) => (
                <label
                  key={channel}
                  className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rose-600 ${
                    details.delivery === channel ? "border-rose-600 bg-cream font-medium text-rose-800" : "border-line bg-cream/60 text-ink-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    value={channel}
                    checked={details.delivery === channel}
                    onChange={() => orderStore.setDetails({ delivery: channel })}
                    className="sr-only"
                  />
                  {channel === "Correo electrónico" ? "Correo" : channel}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="order-comment" className="text-sm font-medium text-ink">
              Algo más para Mel <span className="font-normal text-ink-soft">(opcional)</span>
            </label>
            <textarea
              id="order-comment"
              value={details.comment}
              onChange={(e) => orderStore.setDetails({ comment: e.target.value })}
              rows={2}
              placeholder="Por ejemplo: cuándo rendís o qué unidad necesitás"
              className="mt-1.5 w-full resize-none rounded-xl border border-line bg-cream px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-soft/70 focus:border-rose-600"
            />
          </div>
        </div>

        <p className="mx-5 mb-4 flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
          <WalletIcon size={18} className="mt-px shrink-0 text-rose-600" />
          <span>
            {site.payment.summary} {site.delivery.summary} Mel confirma el total final por WhatsApp.
          </span>
        </p>

        <details className="accordion mx-5 mb-5 rounded-2xl border border-line">
          <summary className="flex items-center justify-between px-4 py-3 text-sm font-medium text-ink">
            Ver el mensaje que se va a enviar
            <span className="chev text-lg leading-none text-rose-600" aria-hidden>
              +
            </span>
          </summary>
          <pre className="whitespace-pre-wrap break-words border-t border-line bg-[#e7f6ea] px-4 py-3 font-sans text-[13px] leading-relaxed text-ink">
            <WhatsAppText text={message} />
          </pre>
        </details>
      </div>

      <div className="border-t border-line bg-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between gap-3">
          <div className="text-sm leading-tight">
            <p className="font-medium text-ink">Total estimado</p>
            {discount > 0 ? (
              <p className="text-xs text-rose-700">
                <s className="text-ink-soft">{formatPrice(subtotal)}</s> · {promo.percent}% off por {subjects} materias
              </p>
            ) : (
              <p className="text-xs text-ink-soft">Mel lo confirma por WhatsApp</p>
            )}
          </div>
          <p className="font-serif text-[1.75rem] font-semibold leading-none text-ink">
            {formatPrice(subtotal - discount)}
            {hasPending && <span className="block text-right font-sans text-[11px] font-normal text-ink-soft">+ a consultar</span>}
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn.primary} mt-3 h-[52px] w-full text-base`}
          onClick={() => {
            setSent(true);
            track({
              name: "whatsapp_order",
              props: { items: lines.length, products: lines.map((l) => `${l.product.slug}:${l.option.id}`).join(",") },
            });
          }}
        >
          <WhatsAppIcon size={22} /> Pedir por WhatsApp
        </a>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-ink-soft hover:text-rose-700">
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            {copied ? "Mensaje copiado" : "Copiar mensaje"}
          </button>
          <button
            type="button"
            onClick={() => orderStore.clear()}
            className="inline-flex h-9 items-center rounded-full px-2 text-ink-soft hover:text-rose-700"
          >
            Vaciar pedido
          </button>
        </div>
        {sent && (
          <p className="mt-1 text-xs text-ink-soft" role="status">
            ¿No se abrió WhatsApp? Copiá el mensaje y mandáselo a Mel al {site.whatsapp.display}.
          </p>
        )}
      </div>
    </>
  );
}
