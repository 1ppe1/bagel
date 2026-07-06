import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  TYPE_COLORS,
  TYPE_LABELS,
  type ArtifactNode,
  type CommentSatellite,
  type Workspace
} from './types.ts';
import {
  createSimNodes,
  radiusForDegree,
  tickSimulation,
  type SimNode
} from './forceGraph.ts';

type Transform = { tx: number; ty: number; scale: number };

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.6;

export function WorkspaceGraph({
  workspace,
  focusId,
  showInspector = true
}: {
  workspace: Workspace;
  /** When set, this node is pre-selected and its links are emphasized as the
   *  impact scope (used by the review screen's Relationships tab). */
  focusId?: string;
  showInspector?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 960, height: 640 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Simulation state lives in refs; a frame counter drives re-render.
  const simRef = useRef<SimNode[]>([]);
  const transformRef = useRef<Transform>({ tx: 0, ty: 0, scale: 1 });
  const timeRef = useRef(0);
  // Cooling factor: decays toward a floor so the layout freezes into place;
  // reheated on interaction for organic motion.
  const alphaRef = useRef(1);
  const [, forceRender] = useState(0);

  const reheat = (value = 0.7) => {
    alphaRef.current = Math.max(alphaRef.current, value);
  };

  // Interaction refs.
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);

  // Keep the selection in sync with an externally-driven focus (e.g. switching
  // which artifact the review screen is showing).
  useEffect(() => {
    if (focusId) {
      setSelectedId(focusId);
    }
  }, [focusId]);

  const nodeById = useMemo(
    () => new Map(workspace.nodes.map((node) => [node.id, node])),
    [workspace]
  );

  // Adjacency for hover highlighting.
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of workspace.nodes) {
      map.set(node.id, new Set());
    }
    for (const link of workspace.links) {
      map.get(link.source)?.add(link.target);
      map.get(link.target)?.add(link.source);
    }
    return map;
  }, [workspace]);

  const commentsByArtifact = useMemo(() => {
    const map = new Map<string, CommentSatellite[]>();
    for (const comment of workspace.comments) {
      const list = map.get(comment.artifactId) ?? [];
      list.push(comment);
      map.set(comment.artifactId, list);
    }
    return map;
  }, [workspace]);

  // Track container size.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Seed the simulation once per workspace. Size changes are handled by the
  // per-tick centroid recentering (which reframes the cloud) rather than by
  // reseeding, so the layout never scatters and jumps around.
  useEffect(() => {
    const { width, height } = sizeRef.current;
    simRef.current = createSimNodes(workspace.nodes, workspace.links, width, height);
    alphaRef.current = 1;
  }, [workspace]);

  // Animation loop.
  useEffect(() => {
    let raf = 0;
    let running = true;
    const loop = () => {
      if (!running) {
        return;
      }
      timeRef.current += 0.016;
      // Cool toward a small floor; drag/hover reheats via reheat().
      alphaRef.current = Math.max(0.015, alphaRef.current * 0.975);
      tickSimulation(
        simRef.current,
        workspace.links,
        size.width,
        size.height,
        timeRef.current,
        alphaRef.current
      );
      forceRender((value) => (value + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [workspace.links, size.width, size.height]);

  function toLogical(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const { tx, ty, scale } = transformRef.current;
    const rect = svg?.getBoundingClientRect();
    const localX = clientX - (rect?.left ?? 0);
    const localY = clientY - (rect?.top ?? 0);
    return { x: (localX - tx) / scale, y: (localY - ty) / scale };
  }

  function onNodePointerDown(event: React.PointerEvent, id: string) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = { id, pointerId: event.pointerId };
    const point = toLogical(event.clientX, event.clientY);
    const node = simRef.current.find((simNode) => simNode.id === id);
    if (node) {
      node.fx = point.x;
      node.fy = point.y;
    }
    reheat();
    setSelectedId(id);
  }

  function onBackgroundPointerDown(event: React.PointerEvent) {
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const { tx, ty } = transformRef.current;
    panRef.current = { startX: event.clientX, startY: event.clientY, tx, ty };
    setSelectedId(null);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (dragRef.current) {
      const point = toLogical(event.clientX, event.clientY);
      const node = simRef.current.find((simNode) => simNode.id === dragRef.current?.id);
      if (node) {
        node.fx = point.x;
        node.fy = point.y;
      }
      reheat();
      return;
    }
    if (panRef.current) {
      const pan = panRef.current;
      transformRef.current = {
        ...transformRef.current,
        tx: pan.tx + (event.clientX - pan.startX),
        ty: pan.ty + (event.clientY - pan.startY)
      };
    }
  }

  function endInteraction() {
    if (dragRef.current) {
      const node = simRef.current.find((simNode) => simNode.id === dragRef.current?.id);
      if (node) {
        node.fx = undefined;
        node.fy = undefined;
      }
      dragRef.current = null;
    }
    panRef.current = null;
  }

  function onWheel(event: React.WheelEvent) {
    const { tx, ty, scale } = transformRef.current;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const rect = svgRef.current?.getBoundingClientRect();
    const px = event.clientX - (rect?.left ?? 0);
    const py = event.clientY - (rect?.top ?? 0);
    // Keep the point under the cursor stationary while zooming.
    transformRef.current = {
      scale: nextScale,
      tx: px - ((px - tx) / scale) * nextScale,
      ty: py - ((py - ty) / scale) * nextScale
    };
  }

  const { tx, ty, scale } = transformRef.current;
  const simById = new Map(simRef.current.map((node) => [node.id, node]));
  const activeId = hoverId ?? selectedId;
  const activeSet =
    activeId != null ? new Set([activeId, ...(neighbors.get(activeId) ?? [])]) : null;
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

  return (
    <div className={showInspector ? 'graph-layout' : 'graph-layout graph-layout-bare'}>
      <div className="graph-canvas-wrap" ref={wrapRef}>
        <svg
          ref={svgRef}
          className="graph-canvas"
          width="100%"
          height="100%"
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endInteraction}
          onPointerLeave={endInteraction}
          onWheel={onWheel}
        >
          <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
            {/* Links */}
            {workspace.links.map((link) => {
              const source = simById.get(link.source);
              const target = simById.get(link.target);
              if (!source || !target) {
                return null;
              }
              const dim =
                activeSet != null &&
                !(activeSet.has(link.source) && activeSet.has(link.target));
              // Links touching the focused artifact are the impact scope (rose).
              const inScope =
                focusId != null && (link.source === focusId || link.target === focusId);
              return (
                <line
                  key={`${link.source}-${link.target}`}
                  className={inScope ? 'graph-link graph-link-scope' : 'graph-link'}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  opacity={dim ? 0.12 : inScope ? 0.9 : 0.5}
                />
              );
            })}

            {/* Nodes + their comment satellites */}
            {workspace.nodes.map((node) => {
              const sim = simById.get(node.id);
              if (!sim) {
                return null;
              }
              const radius = radiusForDegree(sim.degree);
              const dim = activeSet != null && !activeSet.has(node.id);
              const isSelected = node.id === selectedId;
              const color = TYPE_COLORS[node.type];
              const comments = commentsByArtifact.get(node.id) ?? [];

              return (
                <g key={node.id} opacity={dim ? 0.35 : 1}>
                  {/* Comment avatar satellites orbiting the node */}
                  {comments.map((comment, index) => {
                    const orbit = radius + 20;
                    const angle =
                      timeRef.current * 0.4 +
                      (index / comments.length) * Math.PI * 2;
                    const cxSat = sim.x + Math.cos(angle) * orbit;
                    const cySat = sim.y + Math.sin(angle) * orbit;
                    return (
                      <g key={comment.id} className="graph-satellite">
                        <line
                          className="graph-satellite-link"
                          x1={sim.x}
                          y1={sim.y}
                          x2={cxSat}
                          y2={cySat}
                        />
                        <circle cx={cxSat} cy={cySat} r={9} fill={comment.reviewer.bg} />
                        <text
                          x={cxSat}
                          y={cySat}
                          className="graph-satellite-text"
                          fill={comment.reviewer.fg}
                        >
                          {comment.reviewer.initials}
                        </text>
                      </g>
                    );
                  })}

                  <circle
                    className="graph-node"
                    cx={sim.x}
                    cy={sim.y}
                    r={radius}
                    fill={color}
                    stroke={isSelected ? '#37352f' : 'transparent'}
                    strokeWidth={isSelected ? 2.5 : 0}
                    onPointerDown={(event) => onNodePointerDown(event, node.id)}
                    onPointerEnter={() => setHoverId(node.id)}
                    onPointerLeave={() => setHoverId(null)}
                  />
                  <text
                    x={sim.x}
                    y={sim.y + radius + 15}
                    className="graph-node-label"
                    opacity={dim ? 0.5 : 1}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="graph-legend" aria-label="Node type legend">
          {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((type) => (
            <span key={type} className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: TYPE_COLORS[type] }} />
              {TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      </div>

      {showInspector ? (
        <Inspector
          node={selectedNode}
          comments={selectedId ? commentsByArtifact.get(selectedId) ?? [] : []}
          neighborIds={selectedId ? [...(neighbors.get(selectedId) ?? [])] : []}
          nodeById={nodeById}
        />
      ) : null}
    </div>
  );
}

function Inspector({
  node,
  comments,
  neighborIds,
  nodeById
}: {
  node: ArtifactNode | null;
  comments: CommentSatellite[];
  neighborIds: string[];
  nodeById: Map<string, ArtifactNode>;
}) {
  if (!node) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <div className="inspector-empty">
          <h3>Select an artifact</h3>
          <p>Click a node to inspect its type, comments, checks, and connections.</p>
        </div>
      </aside>
    );
  }

  const openComments = comments.filter((comment) => !comment.resolved).length;

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-head">
        <span
          className="inspector-type"
          style={{ background: TYPE_COLORS[node.type] }}
        >
          {TYPE_LABELS[node.type]}
        </span>
        <h2>{node.label}</h2>
        <code className="inspector-file">{node.file}</code>
      </div>

      <p className="inspector-summary">{node.summary}</p>

      <dl className="inspector-stats">
        <div>
          <dt>Comments</dt>
          <dd>
            {comments.length}
            {openComments > 0 ? <span className="inspector-open">{openComments} open</span> : null}
          </dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd>
            {node.checksPassed}/{node.checksTotal} pass
          </dd>
        </div>
        <div>
          <dt>Connections</dt>
          <dd>{neighborIds.length}</dd>
        </div>
      </dl>

      {comments.length > 0 ? (
        <section className="inspector-section">
          <h4>Reviewers</h4>
          <ul className="inspector-comments">
            {comments.map((comment) => (
              <li key={comment.id}>
                <span
                  className="inspector-avatar"
                  style={{ background: comment.reviewer.bg, color: comment.reviewer.fg }}
                >
                  {comment.reviewer.initials}
                </span>
                <span className="inspector-comment-text">{comment.text}</span>
                {comment.fixInstruction ? (
                  <span className="inspector-fix">fix</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {neighborIds.length > 0 ? (
        <section className="inspector-section">
          <h4>Connected</h4>
          <ul className="inspector-connections">
            {neighborIds.map((id) => {
              const neighbor = nodeById.get(id);
              if (!neighbor) {
                return null;
              }
              return (
                <li key={id}>
                  <span
                    className="inspector-conn-dot"
                    style={{ background: TYPE_COLORS[neighbor.type] }}
                  />
                  {neighbor.label}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <button className="inspector-open-btn" type="button">
        Open artifact →
      </button>
    </aside>
  );
}
