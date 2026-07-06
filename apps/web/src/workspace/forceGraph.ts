import type { ArtifactLink, ArtifactNode } from './types.ts';

// A tiny dependency-free force-directed layout.
//
// Per the Notion spec the graph should feel organic: repulsion keeps nodes
// apart, springs pull linked nodes together, a gentle center gravity keeps the
// cloud framed, and a small ambient drift makes it breathe. A dragged node is
// pinned to the pointer while its neighbors follow via the springs.

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Connection degree — drives node radius. */
  degree: number;
  /** When set, the node is pinned here (e.g. being dragged). */
  fx?: number;
  fy?: number;
};

export type SimLink = {
  source: string;
  target: string;
};

const REPULSION = 18000; // pairwise inverse-square strength
const SPRING = 0.05; // link stiffness
const SPRING_LENGTH = 150; // preferred link length
const CENTER_GRAVITY = 0.005; // pull toward the canvas center
const DAMPING = 0.82; // velocity retained per tick
const DRIFT = 0.9; // ambient wander magnitude (scaled by the cooling alpha)
const MAX_SPEED = 10;
const MIN_DIST = 30; // clamp to avoid explosive close-range forces

export function radiusForDegree(degree: number): number {
  // Size = connection degree, with a comfortable floor and a soft ceiling.
  return 15 + Math.min(degree, 8) * 3.2;
}

export function createSimNodes(
  nodes: ArtifactNode[],
  links: ArtifactLink[],
  width: number,
  height: number
): SimNode[] {
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const cx = width / 2;
  const cy = height / 2;
  const count = nodes.length;

  return nodes.map((node, index) => {
    // Seed positions on a ring so the layout unfolds smoothly rather than
    // exploding from a single point.
    const angle = (index / Math.max(count, 1)) * Math.PI * 2;
    const seedRadius = Math.min(width, height) * 0.28;
    return {
      id: node.id,
      x: cx + Math.cos(angle) * seedRadius,
      y: cy + Math.sin(angle) * seedRadius,
      vx: 0,
      vy: 0,
      degree: degree.get(node.id) ?? 0
    };
  });
}

/**
 * Advance the simulation by one tick, mutating node positions in place.
 *
 * `alpha` is a cooling factor (1 = hot, ~0 = frozen) that scales every physical
 * force. It lets the layout converge to a stable, clickable equilibrium and
 * then hold still — reheat it (via the caller) on interaction for organic
 * motion. `time` only drives the phase of the ambient drift.
 */
export function tickSimulation(
  simNodes: SimNode[],
  links: SimLink[],
  width: number,
  height: number,
  time: number,
  alpha: number
): void {
  const cx = width / 2;
  const cy = height / 2;

  // Pairwise repulsion.
  for (let i = 0; i < simNodes.length; i += 1) {
    const a = simNodes[i];
    for (let j = i + 1; j < simNodes.length; j += 1) {
      const b = simNodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.hypot(dx, dy);
      if (dist < MIN_DIST) {
        // Nudge apart deterministically when nearly coincident.
        dx = dx || Math.cos(i + j);
        dy = dy || Math.sin(i + j);
        dist = MIN_DIST;
      }
      const force = (REPULSION / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Springs along links.
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  for (const link of links) {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    if (!source || !target) {
      continue;
    }
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.hypot(dx, dy) || MIN_DIST;
    const force = (dist - SPRING_LENGTH) * SPRING * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }

  // Center gravity + ambient drift, then integrate.
  for (let i = 0; i < simNodes.length; i += 1) {
    const node = simNodes[i];

    if (node.fx !== undefined && node.fy !== undefined) {
      // Pinned: snap to the target and reset momentum.
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }

    node.vx += (cx - node.x) * CENTER_GRAVITY * alpha;
    node.vy += (cy - node.y) * CENTER_GRAVITY * alpha;

    // Per-node phase so nodes wander independently.
    const phase = i * 1.7;
    node.vx += Math.cos(time * 0.7 + phase) * DRIFT * alpha;
    node.vy += Math.sin(time * 0.9 + phase) * DRIFT * alpha;

    node.vx *= DAMPING;
    node.vy *= DAMPING;

    const speed = Math.hypot(node.vx, node.vy);
    if (speed > MAX_SPEED) {
      node.vx = (node.vx / speed) * MAX_SPEED;
      node.vy = (node.vy / speed) * MAX_SPEED;
    }

    node.x += node.vx;
    node.y += node.vy;
  }

  // Keep the whole cloud framed: recenter its centroid on the canvas center so
  // it doesn't slowly wander off-screen. Skipped while a node is pinned so a
  // dragged node stays under the pointer.
  const anyPinned = simNodes.some((node) => node.fx !== undefined);
  if (!anyPinned && simNodes.length > 0) {
    let sumX = 0;
    let sumY = 0;
    for (const node of simNodes) {
      sumX += node.x;
      sumY += node.y;
    }
    const shiftX = cx - sumX / simNodes.length;
    const shiftY = cy - sumY / simNodes.length;
    for (const node of simNodes) {
      node.x += shiftX;
      node.y += shiftY;
    }
  }
}
