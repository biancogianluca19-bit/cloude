import type { MetadataRoute } from "next";
import { site } from "@/data/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#fff6f7",
    theme_color: "#fff6f7",
    lang: "es-AR",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
