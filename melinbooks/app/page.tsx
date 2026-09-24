import { Hero } from "@/components/home/Hero";
import { Programs } from "@/components/home/Programs";
import { Shelf } from "@/components/home/Shelf";
import { HowToBuy } from "@/components/home/HowToBuy";
import { Includes } from "@/components/home/Includes";
import { Promos } from "@/components/home/Promos";
import { AboutMel } from "@/components/home/AboutMel";
import { Testimonials } from "@/components/home/Testimonials";
import { Faq } from "@/components/home/Faq";
import { FinalCta } from "@/components/home/FinalCta";
import { JsonLd } from "@/components/JsonLd";
import { faqs } from "@/data/faq";
import { site, getSiteUrl } from "@/data/site";

export default function HomePage() {
  const url = getSiteUrl();
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "OnlineStore",
            name: site.name,
            description: site.description,
            url,
            logo: `${url}/icon.png`,
            founder: { "@type": "Person", name: site.owner.name },
            sameAs: Object.values(site.social).map((s) => s.url),
            contactPoint: { "@type": "ContactPoint", contactType: "sales", telephone: `+${site.whatsapp.number}`, availableLanguage: "es" },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer.join(" ") },
            })),
          },
        ]}
      />
      <Hero />
      <Programs />
      <Shelf />
      <HowToBuy />
      <Includes />
      <AboutMel />
      <Promos />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
