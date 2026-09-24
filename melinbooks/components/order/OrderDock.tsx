"use client";

import { useEffect, useState } from "react";
import { site } from "@/data/site";
import { CheckIcon, ArrowRightIcon, WhatsAppIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { buildHelloMessage, waLink } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { useOrder } from "./OrderProvider";

/**
 * Parte de abajo de la pantalla: aviso al agregar, barra "Tu pedido"
 * cuando hay algo, y un botón discreto de WhatsApp cuando no.
 */
export function OrderDock() {
  const { lines, openDrawer, toast, dismissToast, bump } = useOrder();
  const fabHidden = useHideOnScrollDown();
  const count = lines.length;
  const subtotal = lines.reduce((s, l) => s + (l.option.price ?? 0), 0);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:items-end md:px-6 md:pb-6">
      <div aria-live="polite" className="w-full max-w-md">
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-fade-up items-center gap-3 rounded-2xl border border-line bg-cream/95 p-3 pl-4 shadow-[var(--shadow-lift)] backdrop-blur"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-600 text-white">
              <CheckIcon size={16} strokeWidth={2.4} />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-snug text-ink">
              {toast.duplicate ? "Ya estaba en tu pedido: " : "Sumaste "}
              <strong className="font-semibold">{toast.title}</strong>
              <span className="block truncate text-ink-soft">{toast.detail}</span>
            </p>
            <button
              type="button"
              onClick={openDrawer}
              className="shrink-0 rounded-full px-3 py-2 text-sm font-medium text-rose-700 hover:bg-blush-100"
            >
              Ver pedido
            </button>
            <button type="button" onClick={dismissToast} className="sr-only focus:not-sr-only">
              Cerrar aviso
            </button>
          </div>
        )}
      </div>

      {count > 0 ? (
        <button
          type="button"
          onClick={openDrawer}
          className="pointer-events-auto flex h-14 w-full max-w-md animate-fade-up items-center gap-3 rounded-full bg-ink pl-2 pr-5 text-left text-cream shadow-[0_14px_34px_-14px_rgb(58_27_41/0.8)] transition hover:bg-rose-800 active:scale-[0.98]"
        >
          <span key={bump} className="grid size-10 animate-pop place-items-center rounded-full bg-rose-500 text-sm font-semibold text-white">
            {count}
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-medium leading-tight">Tu pedido</span>
            <span className="block text-xs text-blush-200">
              {count === 1 ? "1 material" : `${count} materiales`}
              {subtotal > 0 && ` · ${formatPrice(subtotal)}`}
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-medium text-blush-100">
            Revisar <ArrowRightIcon size={16} />
          </span>
        </button>
      ) : (
        <a
          href={waLink(site.whatsapp.number, buildHelloMessage())}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track({ name: "whatsapp_consult", props: { source: "boton-flotante" } })}
          className={`grid size-14 place-items-center self-end rounded-full bg-rose-600 text-white shadow-[0_12px_28px_-12px_rgb(179_76_114/0.9)] ring-4 ring-paper/70 transition duration-300 hover:scale-105 hover:bg-rose-700 active:scale-95 ${
            fabHidden ? "pointer-events-none translate-y-24 opacity-0" : "pointer-events-auto"
          }`}
          aria-label="Escribile a Mel por WhatsApp"
        >
          <WhatsAppIcon size={26} />
        </a>
      )}
    </div>
  );
}

/**
 * En celular, el botón de WhatsApp se corre mientras la persona baja
 * (para no tapar los botones "Agregar") y vuelve apenas sube.
 */
function useHideOnScrollDown(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (window.innerWidth < 768 && y > last + 4 && y > 200) setHidden(true);
      else if (y < last - 4 || y <= 200) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}
