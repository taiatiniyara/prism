"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PDF_REPORT_STYLE,
  PDF_COLOUR_FIELDS,
  PDF_FONT_SLOT_FIELDS,
  PDF_PAGE_SIZES,
  PDF_SIZE_FIELDS,
  normalizePdfStyle,
  type PdfFontSlot,
  type PdfFontSlotsMeta,
  type PdfReportStyle,
} from "@/lib/ai/pdf-settings-constants";
import { removePdfFont, updatePdfReportStyle, uploadPdfFont } from "./service";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function PdfSettingsForm({
  initialStyle,
  initialFontMeta,
}: {
  initialStyle: PdfReportStyle;
  initialFontMeta: PdfFontSlotsMeta;
}) {
  const [style, setStyle] = useState<PdfReportStyle>(initialStyle);
  const [saved, setSaved] = useState<PdfReportStyle>(initialStyle);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(style) !== JSON.stringify(saved);
  const coloursValid = PDF_COLOUR_FIELDS.every((f) => HEX_RE.test(style[f.key]));

  const setField = <K extends keyof PdfReportStyle>(key: K, value: PdfReportStyle[K]) =>
    setStyle((s) => ({ ...s, [key]: value }));

  const onSave = () => {
    const clean = normalizePdfStyle(style);
    startTransition(async () => {
      const res = await updatePdfReportStyle(clean);
      if (res.success) {
        setStyle(clean);
        setSaved(clean);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  const onReset = () => setStyle(DEFAULT_PDF_REPORT_STYLE);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Colours</legend>
          {PDF_COLOUR_FIELDS.map((f) => {
            const value = style[f.key];
            const valid = HEX_RE.test(value);
            return (
              <div key={f.key} className="flex items-start gap-3">
                <input
                  type="color"
                  aria-label={`${f.label} colour picker`}
                  value={valid ? value : "#000000"}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="border-border mt-0.5 size-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={`pdf-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`pdf-${f.key}`}
                    value={value}
                    spellCheck={false}
                    aria-invalid={!valid}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-muted-foreground text-xs">{f.help}</p>
                </div>
              </div>
            );
          })}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Typography &amp; layout</legend>
          <div className="grid grid-cols-2 gap-3">
            {PDF_SIZE_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`pdf-${f.key}`}>
                  {f.label} <span className="text-muted-foreground">({f.unit})</span>
                </Label>
                <Input
                  id={`pdf-${f.key}`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={style[f.key]}
                  onChange={(e) => setField(f.key, Number(e.target.value))}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="pdf-pageSize">Page size</Label>
              <Select
                value={style.pageSize}
                onValueChange={(v) => setField("pageSize", v as PdfReportStyle["pageSize"])}
              >
                <SelectTrigger id="pdf-pageSize" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PDF_PAGE_SIZES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <Button onClick={onSave} disabled={!dirty || pending || !coloursValid}>
            {pending ? "Saving…" : "Save PDF style"}
          </Button>
          <Button variant="outline" onClick={onReset} disabled={pending} type="button">
            Reset to defaults
          </Button>
          {!coloursValid && (
            <span className="text-destructive text-xs">Colours must be #rrggbb.</span>
          )}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Brand font</legend>
          <p className="text-muted-foreground text-xs">
            Optional. Upload a <strong>.ttf</strong> or <strong>.otf</strong>{" "}
            (max 2&nbsp;MB) to replace Helvetica. Regular is required; Bold and
            Italic fall back to Regular if left unset. Saved separately from the
            style above — an upload applies immediately.
          </p>
          <FontSlots initialMeta={initialFontMeta} />
        </fieldset>
      </div>

      {/* ── Live preview ─────────────────────────────────────── */}
      <div className="space-y-2">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Live preview
        </span>
        <PdfPreview style={style} />
        <p className="text-muted-foreground text-xs">
          Approximate preview of the report PDF. Fonts are shown in the browser
          typeface; the generated PDF uses Helvetica (or your brand font once
          uploaded).
        </p>
      </div>
    </div>
  );
}

function PdfPreview({ style }: { style: PdfReportStyle }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="p-6" style={{ color: style.ink }}>
        <div
          style={{
            color: style.accent,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.3,
          }}
        >
          PRISM · Pacific Power Association
        </div>
        <div style={{ fontSize: style.titleSize, fontWeight: 700, lineHeight: 1.15 }}>
          Tonga Power — FY2024 Performance
        </div>
        <div style={{ color: style.muted, fontSize: 9, marginTop: 2 }}>
          Generated 2026-09-21
        </div>
        <div style={{ borderTop: `1px solid ${style.rule}`, margin: "10px 0" }} />

        <div style={{ fontSize: style.headingSize, fontWeight: 700 }}>Reliability</div>
        <p style={{ fontSize: style.bodySize, margin: "4px 0 0", lineHeight: 1.4 }}>
          SAIDI improved 12% year on year, moving below the PPA target for the
          first time since FY2021.
        </p>

        {/* mini table */}
        <div style={{ marginTop: 10 }}>
          {[
            ["Metric", "FY2023", "FY2024"],
            ["SAIDI (min)", "410", "360"],
            ["SAIFI", "6.1", "5.4"],
          ].map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                fontSize: style.tableFontSize,
                fontWeight: i === 0 ? 700 : 400,
                color: i === 0 ? style.ink : "#374151",
                borderBottom: `1px solid ${style.rule}`,
                padding: "3px 0",
              }}
            >
              {row.map((c, j) => (
                <span key={j}>{c}</span>
              ))}
            </div>
          ))}
        </div>

        <p
          style={{
            color: style.accent,
            fontStyle: "italic",
            fontSize: style.bodySize,
            marginTop: 8,
          }}
        >
          Insight: sustained reliability gains track the FY2022 feeder-renewal
          programme.
        </p>
      </div>
    </div>
  );
}

function FontSlots({ initialMeta }: { initialMeta: PdfFontSlotsMeta }) {
  const [meta, setMeta] = useState<PdfFontSlotsMeta>(initialMeta);
  const [busy, setBusy] = useState<PdfFontSlot | null>(null);
  const inputs = useRef<Record<PdfFontSlot, HTMLInputElement | null>>({
    regular: null,
    bold: null,
    italic: null,
  });

  const onPick = async (slot: PdfFontSlot, file: File | null) => {
    if (!file) return;
    setBusy(slot);
    try {
      const fd = new FormData();
      fd.set("slot", slot);
      fd.set("file", file);
      const res = await uploadPdfFont(fd);
      if (res.success) {
        setMeta((m) => ({
          ...m,
          [slot]: { present: true, filename: res.filename ?? file.name },
        }));
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(null);
      const el = inputs.current[slot];
      if (el) el.value = ""; // allow re-selecting the same file
    }
  };

  const onRemove = async (slot: PdfFontSlot) => {
    setBusy(slot);
    try {
      const res = await removePdfFont(slot);
      if (res.success) {
        setMeta((m) => ({ ...m, [slot]: { present: false, filename: null } }));
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {PDF_FONT_SLOT_FIELDS.map((f) => {
        const state = meta[f.slot];
        return (
          <div
            key={f.slot}
            className="border-border flex items-center gap-3 rounded-md border p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {f.label}
                {f.required && (
                  <span className="text-muted-foreground"> (required)</span>
                )}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {state.present ? `Uploaded: ${state.filename}` : "Not set"}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">{f.help}</p>
            </div>
            <input
              ref={(el) => {
                inputs.current[f.slot] = el;
              }}
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf"
              className="hidden"
              onChange={(e) => onPick(f.slot, e.target.files?.[0] ?? null)}
            />
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => inputs.current[f.slot]?.click()}
              >
                {busy === f.slot ? "Uploading…" : state.present ? "Replace" : "Upload"}
              </Button>
              {state.present && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => onRemove(f.slot)}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
