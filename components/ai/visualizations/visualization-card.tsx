"use client";

import { useState } from "react";
import { Copy, Download, FileDown, Maximize2, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VisualizationModal } from "./visualization-modal";

interface IconButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function CardIconButton({ icon: Icon, label, active, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors hover:bg-muted",
        active && "text-foreground bg-muted",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

export interface VisualizationCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  modal?: React.ReactNode;
  showLabels?: boolean;
  onToggleLabels?: () => void;
  onCopyCsv?: () => void | boolean | Promise<boolean> | Promise<void>;
  onDownloadCsv?: () => void;
  onDownloadPng?: () => Promise<void> | void;
  footer?: React.ReactNode;
}

export function VisualizationCard({
  title,
  subtitle,
  children,
  modal,
  showLabels,
  onToggleLabels,
  onCopyCsv,
  onDownloadCsv,
  onDownloadPng,
  footer,
}: VisualizationCardProps) {
  const [open, setOpen] = useState(false);

  const handleCopy = async () => {
    if (!onCopyCsv) return;
    try {
      await onCopyCsv();
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy data");
    }
  };

  const handleCsvDownload = () => {
    if (!onDownloadCsv) return;
    try {
      onDownloadCsv();
      toast.success("Downloaded CSV");
    } catch {
      toast.error("Could not download CSV");
    }
  };

  const handlePng = async () => {
    if (!onDownloadPng) return;
    try {
      await onDownloadPng();
      toast.success("Exported PNG");
    } catch {
      toast.error("Could not export PNG");
    }
  };

  return (
    <div className="border-border bg-card text-card-foreground dark:border-border dark:bg-card overflow-hidden rounded-xl border">
      <div className="flex items-start justify-between gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h4 className="text-foreground truncate text-sm font-medium">{title}</h4>
          {subtitle && (
            <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onToggleLabels && (
            <CardIconButton
              icon={Tag}
              label="Toggle data labels"
              active={showLabels}
              onClick={onToggleLabels}
            />
          )}
          {onCopyCsv && <CardIconButton icon={Copy} label="Copy as CSV" onClick={handleCopy} />}
          {onDownloadCsv && <CardIconButton icon={FileDown} label="Download CSV" onClick={handleCsvDownload} />}
          {onDownloadPng && <CardIconButton icon={Download} label="Download PNG" onClick={handlePng} />}
          {modal && (
            <CardIconButton icon={Maximize2} label="Expand" onClick={() => setOpen(true)} />
          )}
        </div>
      </div>
      <div className="px-4 pb-4 pt-1">{children}</div>
      {footer && <div className="border-border dark:border-border border-t px-4 py-2">{footer}</div>}

      {open && modal && (
        <VisualizationModal title={title} onClose={() => setOpen(false)}>
          {modal}
        </VisualizationModal>
      )}
    </div>
  );
}