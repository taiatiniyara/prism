"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface VisualizationModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function VisualizationModal({ title, onClose, children }: VisualizationModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="bg-card border-border text-card-foreground relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chart"
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}