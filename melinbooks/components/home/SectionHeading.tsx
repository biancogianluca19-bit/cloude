import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { eyebrow } from "@/components/ui/styles";

export function SectionHeading({
  kicker,
  title,
  children,
  id,
  align = "left",
}: {
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
  id?: string;
  align?: "left" | "center";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className={eyebrow}>{kicker}</p>
      <h2 id={id} className="mt-3 text-[2.35rem] leading-[1.02] text-ink md:text-[3.2rem]">
        {title}
      </h2>
      {children && <div className="mt-4 text-[17px] leading-relaxed text-ink-soft">{children}</div>}
    </Reveal>
  );
}
