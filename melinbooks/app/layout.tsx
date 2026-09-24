import type { Metadata, Viewport } from "next";
import { Caveat, Cormorant_Garamond, DM_Sans } from "next/font/google";
import { site, getSiteUrl } from "@/data/site";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AnalyticsScripts } from "@/components/layout/AnalyticsScripts";
import { OrderProvider } from "@/components/order/OrderProvider";
import { OrderDrawer } from "@/components/order/OrderDrawer";
import { OptionPicker } from "@/components/order/OptionPicker";
import { OrderDock } from "@/components/order/OrderDock";
import "./globals.css";

// Fuentes variables: un solo archivo por estilo, alojadas por Next.js.
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
// La manuscrita es decorativa: no se precarga.
const hand = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap", preload: false });

const title = `${site.name} | Resúmenes UBA XXI, CBC y Edición (FILO)`;

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: title, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.owner.name }],
  keywords: ["resúmenes UBA XXI", "resúmenes CBC", "resúmenes Edición FILO", "resumen IPC", "resumen ICSE", "Mel In Books"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: site.name,
    title,
    description: site.description,
    url: "/",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Mel In Books: resúmenes y material de estudio" }],
  },
  twitter: { card: "summary_large_image", title, description: site.description, images: ["/og.jpg"] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#fff6f7",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${serif.variable} ${sans.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        {/* Activa las animaciones de aparición solo si hay JavaScript. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh">
        <OrderProvider>
          <Header />
          <main id="contenido">{children}</main>
          <Footer />
          <OrderDock />
          <OrderDrawer />
          <OptionPicker />
        </OrderProvider>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
