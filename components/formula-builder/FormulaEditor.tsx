"use client";

import { DragEvent, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Operators for the unified builder. WHERE/AND/OR are intentionally dropped —
 *  per-variable dimension scope now lives in the tag cards, not the formula. */
export const OPERATORS = ["+", "-", "*", "/", "(", ")"] as const;
export const DND_TOKEN_KEY = "application/x-prism-formula-token";

const OPERATOR_SET = new Set<string>(OPERATORS);
const isIdentifierToken = (token: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
const isNumericToken = (token: string): boolean =>
  /^-?\d+(\.\d+)?$/.test(token);
export const tokenizeFormula = (text: string): string[] =>
  text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

/** Unique variable identifiers referenced by a formula, in first-seen order. */
export const formulaVariables = (formula: string): string[] => {
  const ids = formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (OPERATOR_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

const OP_GLYPH: Record<string, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "(": "(",
  ")": ")",
};

export interface FormulaEditorProps {
  formula: string;
  onChange: (formula: string) => void;
  knownVariables: string[];
  onNewVariable?: (name: string) => void;
  /** variable name -> tailwind bg/text colour classes (matches its card) */
  variableColors?: Record<string, string>;
}

export function FormulaEditor({
  formula,
  onChange,
  knownVariables,
  onNewVariable,
  variableColors,
}: FormulaEditorProps) {
  const [customToken, setCustomToken] = useState("");
  const [isTextMode, setIsTextMode] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const tokens = useMemo(() => tokenizeFormula(formula), [formula]);
  const knownSet = useMemo(
    () => new Set(knownVariables),
    [knownVariables],
  );

  const setTokens = (next: string[]) => onChange(next.join(" "));
  const appendToken = (token: string) =>
    onChange(`${formula}${formula ? " " : ""}${token}`.trim());

  const removeTokenAtIndex = (index: number) =>
    setTokens(tokens.filter((_, i) => i !== index));

  const addCustomToken = () => {
    const raw = customToken.trim();
    if (!raw) return;
    // Support multi-token entries such as "renewable_gen / total_gen".
    const parts = tokenizeFormula(raw);
    for (const part of parts) {
      appendToken(part);
      if (
        isIdentifierToken(part) &&
        !OPERATOR_SET.has(part) &&
        !isNumericToken(part) &&
        !knownSet.has(part)
      ) {
        onNewVariable?.(part);
      }
    }
    setCustomToken("");
  };

  // --- text edit mode -----------------------------------------------------
  const openTextMode = () => {
    setTextDraft(formula);
    setIsTextMode(true);
  };
  const commitTextMode = () => {
    const trimmed = textDraft.trim();
    onChange(trimmed);
    // announce any brand-new variables the raw edit introduced
    for (const v of formulaVariables(trimmed)) {
      if (!knownSet.has(v)) onNewVariable?.(v);
    }
    setIsTextMode(false);
  };

  // --- drag reorder -------------------------------------------------------
  const handleDragStart = (
    event: DragEvent<HTMLSpanElement>,
    index: number,
  ) => {
    dragIndex.current = index;
    event.dataTransfer.setData(
      DND_TOKEN_KEY,
      JSON.stringify({ index, token: tokens[index] }),
    );
    event.dataTransfer.effectAllowed = "move";
  };
  const handleDropOnChip = (
    event: DragEvent<HTMLSpanElement>,
    targetIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === targetIndex) return;
    const next = [...tokens];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setTokens(next);
  };
  const handleDropOnCanvas = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const raw = event.dataTransfer.getData(DND_TOKEN_KEY);
    if (!raw || dragIndex.current == null) return;
    // dropped past the end → move to tail
    const from = dragIndex.current;
    dragIndex.current = null;
    const next = [...tokens];
    const [moved] = next.splice(from, 1);
    next.push(moved);
    setTokens(next);
  };

  // --- autocomplete affordance for the free-token input -------------------
  const suggestions = useMemo(() => {
    const raw = customToken.trim();
    if (!raw || !isIdentifierToken(raw)) return [];
    const term = raw.toLowerCase();
    return knownVariables
      .filter((v) => v.toLowerCase().includes(term) && v !== raw)
      .slice(0, 5);
  }, [customToken, knownVariables]);
  const showCreateHint =
    customToken.trim().length > 0 &&
    isIdentifierToken(customToken.trim()) &&
    !knownSet.has(customToken.trim());

  return (
    <div className="space-y-2.5">
      {/* formula canvas */}
      <div
        onDragOver={(e) => {
          if (isTextMode) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDropOnCanvas}
        className={cn(
          "min-h-14 rounded-lg border bg-muted/30 px-3 py-2.5 font-mono text-sm",
          dragOver && "ring-2 ring-primary/50",
        )}
      >
        {isTextMode ? (
          <Input
            autoFocus
            value={textDraft}
            placeholder="Edit formula as raw text"
            onChange={(e) => setTextDraft(e.target.value)}
            onBlur={commitTextMode}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTextMode();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setIsTextMode(false);
              }
            }}
            className="h-8 font-mono text-sm"
          />
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground font-sans text-sm">
            Type a variable name or use the operators below. A new name creates
            its input card; an existing name links to it.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {tokens.map((token, index) => {
              const isOp = OPERATOR_SET.has(token);
              const isNum = isNumericToken(token);
              const isVar = !isOp && !isNum && isIdentifierToken(token);
              return (
                <span
                  key={`${token}-${index}`}
                  draggable={!isTextMode}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnChip(e, index)}
                  onDoubleClick={openTextMode}
                  className={cn(
                    "inline-flex cursor-grab items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold active:cursor-grabbing",
                    isVar &&
                      (variableColors?.[token] ??
                        "bg-accent text-accent-foreground/90 dark:bg-accent"),
                    isNum &&
                      "bg-lime-100 text-lime-800 dark:bg-lime-950/40 dark:text-lime-300",
                    isOp && "bg-transparent font-sans text-muted-foreground",
                  )}
                >
                  {isOp ? (
                    <span className="px-0.5 text-base">
                      {OP_GLYPH[token] ?? token}
                    </span>
                  ) : (
                    <>
                      <span>{token}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${token}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTokenAtIndex(index);
                        }}
                        className="text-destructive/70 hover:text-destructive font-bold"
                      >
                        &times;
                      </button>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* operator palette */}
      <div className="flex flex-wrap items-center gap-1.5">
        {OPERATORS.map((op) => (
          <Button
            key={op}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-8 px-2 font-mono text-base"
            onClick={() => appendToken(op)}
          >
            {OP_GLYPH[op] ?? op}
          </Button>
        ))}
        <span className="text-muted-foreground ml-1 text-xs">
          insert an operator
        </span>
        {!isTextMode && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-8 text-xs"
            onClick={openTextMode}
          >
            Edit as text
          </Button>
        )}
      </div>

      {/* free token / new-variable entry */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <Input
            value={customToken}
            placeholder="Add a variable or constant (e.g. renewable_gen, 100)"
            onChange={(e) => setCustomToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomToken();
              }
            }}
            className="h-8 text-sm sm:max-w-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={addCustomToken}
          >
            Add
          </Button>
        </div>
        {(suggestions.length > 0 || showCreateHint) && (
          <div className="bg-popover absolute z-20 mt-1 w-full max-w-xs overflow-hidden rounded-md border shadow-md">
            {showCreateHint && (
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                onClick={addCustomToken}
              >
                <span className="font-semibold">
                  &#43; Create new input &ldquo;{customToken.trim()}&rdquo;
                </span>
                <span className="text-muted-foreground text-xs">
                  adds a card below
                </span>
              </button>
            )}
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm"
                onClick={() => {
                  appendToken(s);
                  setCustomToken("");
                }}
              >
                <span className="font-mono font-semibold">{s}</span>
                <span className="text-muted-foreground text-xs">
                  existing input
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FormulaEditor;
