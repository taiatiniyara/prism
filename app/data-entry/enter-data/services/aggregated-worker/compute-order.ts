/**
 * Dependency ordering for computed nodes (calculated measures, and later KPIs).
 *
 * A node's formula reads other measures; when one of those is *itself* a
 * computed node it must be evaluated first. This replaces the aggregated
 * worker's `MAX_PASS_MULTIPLIER` fixpoint — instead of re-trying targets until
 * nothing new resolves, sort them once (Kahn's algorithm) and evaluate in
 * order. A cycle is a definition-time error: it is surfaced here so the save
 * path can reject it, rather than silently stalling the compute.
 *
 * Pure and dependency-free.
 */

export interface ComputeNode {
  id: number;
  /** measure ids this node's formula references (any ids, unfiltered). */
  inputIds: number[];
}

export interface ComputeOrder {
  /** node ids, dependencies first; excludes anything caught in a cycle. */
  order: number[];
  /** node ids that could not be ordered — in, or downstream of, a cycle. */
  cyclic: number[];
}

export const resolveComputeOrder = (nodes: ComputeNode[]): ComputeOrder => {
  const ids = new Set(nodes.map((n) => n.id));

  // Edges only matter between nodes in the set; a formula input that isn't a
  // computed node (a raw measure) imposes no ordering.
  const dependsOn = new Map<number, Set<number>>();
  const dependents = new Map<number, Set<number>>();
  for (const node of nodes) {
    dependsOn.set(node.id, new Set());
    dependents.set(node.id, dependents.get(node.id) ?? new Set());
    for (const inputId of node.inputIds) {
      if (inputId === node.id || !ids.has(inputId)) continue;
      dependsOn.get(node.id)!.add(inputId);
      const back = dependents.get(inputId) ?? new Set<number>();
      back.add(node.id);
      dependents.set(inputId, back);
    }
  }

  const inDegree = new Map<number, number>();
  for (const node of nodes) {
    inDegree.set(node.id, dependsOn.get(node.id)!.size);
  }

  // Ready = no unresolved dependencies. Process in ascending id for a stable
  // order (helps tests and log-reading).
  const ready = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)
    .sort((a, b) => a - b);

  const order: number[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    const nextReady: number[] = [];
    for (const dependent of dependents.get(id) ?? []) {
      const deg = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) nextReady.push(dependent);
    }
    if (nextReady.length > 0) {
      ready.push(...nextReady.sort((a, b) => a - b));
      ready.sort((a, b) => a - b);
    }
  }

  const ordered = new Set(order);
  const cyclic = nodes
    .map((n) => n.id)
    .filter((id) => !ordered.has(id))
    .sort((a, b) => a - b);

  return { order, cyclic };
};

/**
 * Would giving node `id` the inputs `inputIds` put it in a dependency cycle,
 * given the rest of the graph (`others`)? Used by the save path to reject a
 * formula edit before it is written.
 */
export const wouldCreateCycle = (
  id: number,
  inputIds: number[],
  others: ComputeNode[],
): boolean =>
  resolveComputeOrder([
    ...others.filter((n) => n.id !== id),
    { id, inputIds },
  ]).cyclic.includes(id);
