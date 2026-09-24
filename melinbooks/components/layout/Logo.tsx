import Image from "next/image";
import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Mel In Books, ir al inicio">
      <Image
        src="/img/logo-sello.webp"
        alt=""
        width={40}
        height={41}
        className="size-10 transition-transform duration-500 ease-out group-hover:rotate-[-12deg]"
        priority
      />
      <span className="font-serif text-[1.45rem] font-semibold leading-none tracking-tight text-ink">
        Mel <span className="italic font-medium text-rose-600">In</span> Books
      </span>
    </Link>
  );
}
