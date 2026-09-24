"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site } from "@/data/site";
import { Logo } from "./Logo";
import { navLinks } from "./nav";
import { Dialog } from "@/components/ui/Dialog";
import { BagIcon, CloseIcon, InstagramIcon, MenuIcon, SearchIcon, TikTokIcon, WhatsAppIcon } from "@/components/icons";
import { useOrder } from "@/components/order/OrderProvider";
import { buildHelloMessage, waLink } from "@/lib/whatsapp";

export function Header() {
  const { lines, openDrawer, bump } = useOrder();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled ? "border-b border-line bg-paper/90 shadow-[0_6px_20px_-18px_rgb(122_46_75/0.6)] backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-cream"
      >
        Saltar al contenido
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:h-[72px] md:px-6">
        <Logo />
        <nav aria-label="Principal" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => {
              const active = link.href === pathname;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className="relative rounded-full px-3.5 py-2 text-[15px] text-ink-soft transition hover:text-rose-700 aria-[current=page]:text-rose-700 after:absolute after:inset-x-3.5 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-rose-400 after:transition-transform after:duration-300 hover:after:scale-x-100 aria-[current=page]:after:scale-x-100"
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-3">
          <Link
            href="/catalogo?buscar=1"
            className="grid size-11 place-items-center rounded-full text-ink transition hover:bg-blush-100 md:hidden"
            aria-label="Buscar un resumen"
          >
            <SearchIcon size={22} />
          </Link>
          <button
            type="button"
            onClick={openDrawer}
            className="relative grid size-11 place-items-center rounded-full text-ink transition hover:bg-blush-100"
            aria-label={`Ver mi pedido (${lines.length} ${lines.length === 1 ? "material" : "materiales"})`}
          >
            <BagIcon size={22} />
            {lines.length > 0 && (
              <span
                key={bump}
                className="absolute right-1 top-1 grid min-w-5 animate-pop place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold leading-5 text-white"
              >
                {lines.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-11 place-items-center rounded-full text-ink transition hover:bg-blush-100 md:hidden"
            aria-label="Abrir menú"
            aria-haspopup="dialog"
          >
            <MenuIcon size={22} />
          </button>
        </div>
      </div>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} labelledBy="menu-title" variant="bottom">
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id="menu-title" className="font-serif text-2xl text-ink">
            Menú
          </h2>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-blush-100"
            aria-label="Cerrar menú"
          >
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="Menú" className="px-3 pb-2">
          <ul>
            {[{ href: "/", label: "Inicio" }, ...navLinks].map((link, i) => (
              <li key={link.href} className="result-in" style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-3 py-3.5 font-serif text-[1.65rem] leading-none text-ink transition hover:bg-blush-100"
                >
                  {link.label}
                  <span aria-hidden className="font-sans text-base text-rose-400">
                    ✦
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 border-t border-line px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <a
            href={waLink(site.whatsapp.number, buildHelloMessage())}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 font-medium text-white"
          >
            <WhatsAppIcon /> Escribirle a Mel
          </a>
          <a
            href={site.social.instagram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid size-12 place-items-center rounded-full border border-line text-rose-700"
            aria-label="Instagram de Mel In Books"
          >
            <InstagramIcon />
          </a>
          <a
            href={site.social.tiktok.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid size-12 place-items-center rounded-full border border-line text-rose-700"
            aria-label="TikTok de Mel In Books"
          >
            <TikTokIcon />
          </a>
        </div>
      </Dialog>
    </header>
  );
}
