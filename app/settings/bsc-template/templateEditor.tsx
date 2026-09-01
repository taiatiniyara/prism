"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createTemplateNode,
  deleteTemplateNode,
  fetchTemplate,
  setTemplateNodeLinks,
  updateTemplateNode,
} from "@/app/data-entry/balanced-scorecard/new-bsc/client";
import type {
  BscTemplateLevel,
  TemplateNode,
} from "@/app/data-entry/balanced-scorecard/new-bsc/types";

const CHILD_LEVEL: Record<BscTemplateLevel, BscTemplateLevel | null> = {
  perspective: "overall_objective",
  overall_objective: "key_focus_area",
  key_focus_area: "strategic_objective",
  strategic_objective: "strategic_lever",
  strategic_lever: null,
};

const LEVEL_LABEL: Record<BscTemplateLevel, string> = {
  perspective: "Perspective",
  overall_objective: "Overall Objective",
  key_focus_area: "Key Focus Area",
  strategic_objective: "Strategic Objective",
  strategic_lever: "Strategic Lever",
};

type FlatNode = { id: string; label: string; level: BscTemplateLevel };

export default function BscTemplateEditor({
  initialNodes,
  canEditLinks = false,
}: {
  initialNodes: TemplateNode[];
  // Master cause-effect links are BMO-only; everyone else sees them read-only.
  canEditLinks?: boolean;
}) {
  const [nodes, setNodes] = useState<TemplateNode[]>(initialNodes);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<TemplateNode | null>(null);
  const [busy, setBusy] = useState(false);

  // Candidate link targets = every node visible on the strategy map. Labels for
  // rendering the chosen targets.
  const { linkCandidates, labelById } = useMemo(() => {
    const candidates: FlatNode[] = [];
    const labels = new Map<string, string>();
    const walk = (list: TemplateNode[]) => {
      for (const n of list) {
        labels.set(n.id, n.label);
        if (n.isMapNode) {
          candidates.push({ id: n.id, label: n.label, level: n.level });
        }
        walk(n.children);
      }
    };
    walk(nodes);
    return { linkCandidates: candidates, labelById: labels };
  }, [nodes]);

  const refresh = async () => {
    try {
      const data = await fetchTemplate();
      setNodes(data.nodes);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to reload template.",
      );
    }
  };

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addChild = (parent: TemplateNode | null) => {
    const level: BscTemplateLevel = parent
      ? (CHILD_LEVEL[parent.level] as BscTemplateLevel)
      : "perspective";
    const siblingCount = parent
      ? parent.children.length
      : nodes.length;
    void withBusy(async () => {
      await createTemplateNode({
        parentId: parent ? parent.id : null,
        level,
        label: `New ${LEVEL_LABEL[level]}`,
        isMandatory: false,
        ord: siblingCount,
      });
      toast.success(`${LEVEL_LABEL[level]} added.`);
    });
  };

  const renameNode = (node: TemplateNode, label: string) => {
    if (label.trim() === node.label) return;
    void withBusy(async () => {
      await updateTemplateNode(node.id, { label: label.trim() });
    });
  };

  const setMandatory = (node: TemplateNode, isMandatory: boolean) =>
    void withBusy(async () => {
      await updateTemplateNode(node.id, { isMandatory });
    });

  const setMapNode = (node: TemplateNode, isMapNode: boolean) =>
    void withBusy(async () => {
      await updateTemplateNode(node.id, { isMapNode });
    });

  const toggleLink = (node: TemplateNode, targetId: string) => {
    const next = node.linkTargets.includes(targetId)
      ? node.linkTargets.filter((t) => t !== targetId)
      : [...node.linkTargets, targetId];
    void withBusy(async () => {
      await setTemplateNodeLinks(node.id, next);
    });
  };

  // Reorder a node among its siblings by normalising sibling `ord` to the new
  // positions (only changed rows are persisted).
  const moveNode = (
    node: TemplateNode,
    siblings: TemplateNode[],
    direction: "up" | "down",
  ) => {
    const index = siblings.findIndex((s) => s.id === node.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    void withBusy(async () => {
      await Promise.all(
        reordered.map((sibling, idx) =>
          sibling.ord === idx
            ? Promise.resolve()
            : updateTemplateNode(sibling.id, { ord: idx }),
        ),
      );
    });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const node = pendingDelete;
    setPendingDelete(null);
    void withBusy(async () => {
      await deleteTemplateNode(node.id);
      toast.success("Node deleted.");
    });
  };

  const renderNode = (
    node: TemplateNode,
    depth: number,
    siblings: TemplateNode[],
  ) => {
    const childLevel = CHILD_LEVEL[node.level];
    const isCollapsed = collapsed.has(node.id);
    const index = siblings.findIndex((s) => s.id === node.id);
    const canUp = index > 0;
    const canDown = index < siblings.length - 1;
    return (
      <div key={node.id} style={{ paddingLeft: depth * 16 }} className="py-0.5">
        <div className="flex items-center gap-2">
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleCollapsed(node.id)}
              className="text-muted-foreground"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-block w-3.5" />
          )}

          <Input
            className="h-7 w-[32ch] text-xs"
            defaultValue={node.label}
            maxLength={32}
            disabled={busy}
            onBlur={(event) => renameNode(node, event.target.value)}
          />

          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {LEVEL_LABEL[node.level]}
          </span>

          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Checkbox
              checked={node.isMandatory}
              disabled={busy}
              onCheckedChange={(checked) =>
                setMandatory(node, checked === true)
              }
            />
            Mandatory
          </label>

          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Checkbox
              checked={node.isMapNode}
              disabled={busy}
              onCheckedChange={(checked) => setMapNode(node, checked === true)}
            />
            On strategy map
          </label>

          {node.isMapNode ? (
            <div className="flex items-center gap-1">
              {canEditLinks ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px]"
                      disabled={busy}
                    >
                      <Link2 className="mr-1 size-3" />
                      Drives
                      {node.linkTargets.length
                        ? ` (${node.linkTargets.length})`
                        : ""}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-72 w-64 overflow-auto"
                  >
                    <DropdownMenuLabel>
                      Drives → (cause → effect)
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {linkCandidates.filter((c) => c.id !== node.id).length ===
                    0 ? (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        No other map nodes yet.
                      </div>
                    ) : (
                      linkCandidates
                        .filter((c) => c.id !== node.id)
                        .map((c) => (
                          <DropdownMenuCheckboxItem
                            key={c.id}
                            checked={node.linkTargets.includes(c.id)}
                            disabled={busy}
                            onCheckedChange={() => toggleLink(node, c.id)}
                            onSelect={(event) => event.preventDefault()}
                          >
                            {c.label}
                            <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                              {LEVEL_LABEL[c.level]}
                            </span>
                          </DropdownMenuCheckboxItem>
                        ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : node.linkTargets.length ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Link2 className="size-3" />
                </span>
              ) : null}
              {node.linkTargets.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {labelById.get(t) ?? "?"}
                </Badge>
              ))}
            </div>
          ) : null}

          {childLevel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              disabled={busy}
              onClick={() => addChild(node)}
            >
              <Plus className="mr-1 size-3" /> {LEVEL_LABEL[childLevel]}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy || !canUp}
            aria-label="Move up"
            onClick={() => moveNode(node, siblings, "up")}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy || !canDown}
            aria-label="Move down"
            onClick={() => moveNode(node, siblings, "down")}
          >
            <ArrowDown className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => setPendingDelete(node)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {!isCollapsed
          ? node.children.map((child) =>
              renderNode(child, depth + 1, node.children),
            )
          : null}
      </div>
    );
  };

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Edit labels inline (saved on blur). Toggle mandatory, reorder with the
          up/down arrows, add child nodes, or delete (deletes the node and all
          descendants).
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => addChild(null)}
        >
          <Plus className="mr-1 size-3" /> Perspective
        </Button>
      </div>

      {nodes.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No template nodes yet. Seed with{" "}
          <code>npm run db-seed-bsc</code> or add a perspective above.
        </p>
      ) : (
        nodes.map((node) => renderNode(node, 0, nodes))
      )}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.label}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the node and all descendants from the master
              template. Utility scorecards keep their own copies of selected
              items, but the node will no longer be offered going forward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
