import type { MetadataRoute } from "next";
import { products } from "@/data/catalog";
import { getSiteUrl } from "@/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = getSiteUrl();
  return [
    { url, changeFrequency: "weekly", priority: 1 },
    { url: `${url}/catalogo`, changeFrequency: "weekly", priority: 0.9 },
    ...products.map((p) => ({ url: `${url}/resumen/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
