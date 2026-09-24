"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Variant = "side" | "center" | "bottom";

const panelPosition: Record<Variant, string> = {
  // Abajo en celular; al costado (side) o centrado (center) en pantallas grandes.
  side: "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-[28px]",
  center:
    "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] md:inset-auto md:top-1/2 md:left-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px]",
  bottom: "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px]",
};

export function Dialog({
  open,
  onClose,
  labelledBy,
  variant = "center",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  variant?: Variant;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`sheet ${variant}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet-panel absolute flex flex-col overflow-hidden bg-cream shadow-[var(--shadow-lift)] ${panelPosition[variant]}`}
      >
        {children}
      </div>
    </dialog>
  );
}
