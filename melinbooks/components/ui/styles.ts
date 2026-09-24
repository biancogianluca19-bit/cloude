/** Clases compartidas para botones y enlaces con forma de botón. */
const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const btn = {
  primary: `${base} h-12 px-6 text-[15px] bg-rose-600 text-white shadow-[0_6px_18px_-8px_rgb(179_76_114/0.7)] hover:bg-rose-700 hover:shadow-[0_10px_24px_-10px_rgb(179_76_114/0.8)]`,
  secondary: `${base} h-12 px-6 text-[15px] border border-rose-600/40 bg-cream/70 text-rose-800 hover:border-rose-600 hover:bg-blush-50`,
  ghost: `${base} h-10 px-4 text-sm text-rose-800 hover:bg-blush-100`,
  small: `${base} h-10 px-4 text-sm bg-rose-600 text-white hover:bg-rose-700`,
};

export const chip =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-cream px-3.5 text-sm text-ink-soft transition hover:border-rose-400 hover:text-rose-800 aria-pressed:border-rose-600 aria-pressed:bg-rose-600 aria-pressed:text-white";

export const eyebrow = "font-sans text-xs font-medium uppercase tracking-[0.2em] text-rose-700";
