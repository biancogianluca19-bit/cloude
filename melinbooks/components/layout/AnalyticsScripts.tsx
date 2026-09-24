import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";

/**
 * Analítica. Cada herramienta se carga solo si está configurada en las
 * variables de entorno (ver README y .env.example).
 */
export function AnalyticsScripts() {
  const vercel = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === "true";
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const ga = process.env.NEXT_PUBLIC_GA_ID;
  return (
    <>
      {vercel && <Analytics />}
      {plausible && (
        <>
          <Script defer data-domain={plausible} src="https://plausible.io/js/script.tagged-events.js" strategy="afterInteractive" />
          <Script id="plausible-init" strategy="afterInteractive">
            {`window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }`}
          </Script>
        </>
      )}
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} window.gtag = gtag; gtag('js', new Date()); gtag('config', '${ga}', { anonymize_ip: true });`}
          </Script>
        </>
      )}
    </>
  );
}
