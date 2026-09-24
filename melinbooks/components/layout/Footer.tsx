import Image from "next/image";
import Link from "next/link";
import { site } from "@/data/site";
import { programs } from "@/data/catalog";
import { navLinks } from "./nav";
import { FacebookIcon, GoodreadsIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/icons";
import { buildHelloMessage, waLink } from "@/lib/whatsapp";

const socials = [
  { ...site.social.instagram, label: "Instagram", Icon: InstagramIcon },
  { ...site.social.tiktok, label: "TikTok", Icon: TikTokIcon },
  { ...site.social.facebook, label: "Facebook", Icon: FacebookIcon },
  { ...site.social.goodreads, label: "Goodreads", Icon: GoodreadsIcon },
];

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden bg-ink pb-28 text-blush-100 md:pb-12">
      {/* Borde de papel rasgado */}
      <svg aria-hidden viewBox="0 0 1440 40" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-6 w-full text-paper md:h-8">
        <path
          fill="currentColor"
          d="M0 0h1440v18c-38 6-61-9-98 1s-55 14-92 6-63-12-104-4-58 15-97 9-66-14-108-8-57 16-96 10-60-15-101-9-62 16-104 9-57-13-95-6-67 14-107 7-60-13-100-6-58 13-94 8S38 11 0 20Z"
        />
      </svg>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 pt-20 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:gap-8">
        <div className="col-span-2 md:col-span-1">
          <Image src="/img/logo-sello-claro.webp" alt="Sello de Mel In Books" width={96} height={98} className="size-24" />
          <p className="mt-5 font-serif text-3xl text-cream">Mel In Books</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-blush-200/80">{site.description}</p>
          <a
            href={waLink(site.whatsapp.number, buildHelloMessage())}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-medium text-white transition hover:bg-rose-500"
          >
            <WhatsAppIcon size={18} /> {site.whatsapp.display}
          </a>
        </div>

        <nav aria-label="Pie de página">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-400">El sitio</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-blush-100/90 transition hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-rose-400">Resúmenes</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {programs.map((p) => (
              <li key={p.id}>
                <Link href={`/catalogo?programa=${p.id}`} className="text-blush-100/90 transition hover:text-white">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-rose-400">Redes</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {socials.map(({ url, label, Icon }) => (
              <li key={label}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 text-blush-100/90 transition hover:text-white">
                  <Icon size={18} /> {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-6xl flex-col gap-2 border-t border-white/10 px-6 pt-6 text-xs text-blush-200/60 md:flex-row md:justify-between">
        <p>© {new Date().getFullYear()} Mel In Books · {site.owner.name}</p>
        <p>Material de estudio para estudiantes de la UBA. Mel In Books no está afiliado a la Universidad de Buenos Aires.</p>
      </div>
    </footer>
  );
}
