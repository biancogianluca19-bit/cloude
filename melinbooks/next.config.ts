import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sitio 100% estático: `npm run build` genera la carpeta `out/`,
  // que se puede publicar en Vercel o en cualquier hosting de archivos.
  output: "export",
  poweredByHeader: false,
  images: {
    // Las imágenes ya están optimizadas en .webp dentro de public/img.
    unoptimized: true,
  },
};

export default nextConfig;
