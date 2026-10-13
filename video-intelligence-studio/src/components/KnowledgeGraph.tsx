import cytoscape, { Core, ElementDefinition, StylesheetStyle } from "cytoscape";
import {
  Database,
  Focus,
  Layers3,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Search,
  Timer,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CommunityReport,
  OntologyKind,
  OntologyNode,
  OntologyRelation,
  TextUnit,
} from "../lib/analysis";

type GraphData = {
  nodes: OntologyNode[];
  relations: OntologyRelation[];
  communities: CommunityReport[];
  textUnits: TextUnit[];
  schemaVersion: string;
  source: string;
};

type KnowledgeGraphProps = {
  projectId: string;
  mode: "relations" | "story";
  refreshToken?: string;
};

type GraphView = "semantic" | "communities" | "evidence";

const KIND_LABELS: Record<OntologyKind, string> = {
  Person: "人物",
  Organization: "组织",
  Location: "地点",
  Object: "物体",
  Concept: "概念",
  Event: "事件",
  Claim: "判断",
  Evidence: "证据",
  Community: "社区",
};

const STATUS_LABELS: Record<string, string> = {
  extracted: "模型抽取",
  observed: "直接证据",
  detected: "社区聚类",
  supported: "证据支持",
  uncertain: "待验证",
  contradicted: "证据冲突",
};

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": "#69736b",
      "border-color": "#f5f0e7",
      "border-width": 1.5,
      color: "#171815",
      label: "data(label)",
      "font-size": 9,
      "font-weight": 600,
      "text-background-color": "#f7f3eb",
      "text-background-opacity": 0.88,
      "text-background-padding": "3px",
      "text-max-width": "92px",
      "text-wrap": "ellipsis",
      "text-margin-y": 18,
      height: 28,
      width: 28,
    },
  },
  { selector: 'node[kind = "Person"]', style: { "background-color": "#2d7b70", shape: "ellipse" } },
  { selector: 'node[kind = "Event"]', style: { "background-color": "#db6745", shape: "diamond" } },
  { selector: 'node[kind = "Organization"]', style: { "background-color": "#8366a2", shape: "round-rectangle" } },
  { selector: 'node[kind = "Location"]', style: { "background-color": "#4278a5", shape: "pentagon" } },
  { selector: 'node[kind = "Object"]', style: { "background-color": "#c69a36", shape: "rectangle" } },
  { selector: 'node[kind = "Concept"]', style: { "background-color": "#7c827f", shape: "hexagon" } },
  {
    selector: 'node[kind = "Claim"]',
    style: { "background-color": "#d34e5d", shape: "round-rectangle", width: 34, height: 22 },
  },
  {
    selector: 'node[kind = "Evidence"]',
    style: { "background-color": "#f4eee2", "border-color": "#73736d", shape: "tag", width: 22, height: 18 },
  },
  {
    selector: 'node[kind = "Community"]',
    style: {
      "background-color": "#e15f3d",
      "background-opacity": 0.07,
      "border-color": "#c85a3c",
      "border-style": "dashed",
      "border-width": 1.5,
      color: "#71301f",
      "font-size": 10,
      "font-weight": 700,
      padding: "28px",
      shape: "round-rectangle",
      "text-background-color": "#f7f3eb",
      "text-background-opacity": 1,
      "text-margin-y": -8,
      "text-valign": "top",
    },
  },
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 0.1, 3, 0.7, 3)",
      "line-color": "#96938a",
      "target-arrow-color": "#96938a",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "",
      opacity: 0.64,
    },
  },
  {
    selector: "edge.focused",
    style: {
      label: "data(label)",
      "font-size": 8,
      color: "#292a27",
      "text-background-color": "#f5f0e7",
      "text-background-opacity": 0.94,
      "text-background-padding": "2px",
      "line-color": "#db6745",
      "target-arrow-color": "#db6745",
      opacity: 1,
      "z-index": 10,
    },
  },
  {
    selector: "node.selected",
    style: {
      "border-color": "#171815",
      "border-width": 4,
      "overlay-color": "#e15f3d",
      "overlay-opacity": 0.12,
      "overlay-padding": 8,
      "z-index": 20,
    },
  },
  { selector: ".dimmed", style: { opacity: 0.12 } },
];

export function KnowledgeGraph({ projectId, mode, refreshToken }: KnowledgeGraphProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<GraphView>(mode === "relations" ? "semantic" : "communities");
  const [query, setQuery] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<Set<OntologyKind>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/graph/${encodeURIComponent(projectId)}`);
      if (!response.ok) throw new Error("Neo4j 暂不可用");
      const graph = await response.json() as GraphData;
      setData(graph);
      setSelectedId((current) =>
        graph.nodes.some((node) => node.id === current) ? current : "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图谱加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph, refreshToken]);

  useEffect(() => {
    setView(mode === "relations" ? "semantic" : "communities");
  }, [mode]);

  const evidenceFocusId = view === "evidence" ? selectedId : "";
  const graph = useMemo(() => {
    if (!data) return { nodes: [], relations: [] };
    let nodes = data.nodes.filter((node) => !hiddenKinds.has(node.kind));
    let relationKinds: string[] = [];
    if (view === "semantic") {
      nodes = nodes.filter((node) => node.kind !== "Evidence" && node.kind !== "Community");
      relationKinds = ["SUPPORTS", "IN_COMMUNITY"];
    } else if (view === "communities") {
      nodes = nodes.filter((node) => node.kind !== "Evidence");
      relationKinds = data.relations
        .map((relation) => relation.kind)
        .filter((kind) => kind !== "IN_COMMUNITY");
    } else {
      const focusIds = new Set(
        evidenceFocusId && data.nodes.some((node) => node.id === evidenceFocusId)
          ? [evidenceFocusId]
          : data.nodes.filter((node) => node.kind === "Claim").map((node) => node.id),
      );
      for (let depth = 0; depth < 1; depth += 1) {
        const currentIds = new Set(focusIds);
        for (const relation of data.relations) {
          if (!["SUPPORTS", "ASSERTS", "ABOUT"].includes(relation.kind)) continue;
          if (currentIds.has(relation.source) || currentIds.has(relation.target)) {
            focusIds.add(relation.source);
            focusIds.add(relation.target);
          }
        }
      }
      nodes = nodes.filter((node) => focusIds.has(node.id));
      relationKinds = ["IN_COMMUNITY"];
    }
    if (query.trim()) {
      const normalized = query.trim().toLocaleLowerCase();
      const matches = new Set(nodes
        .filter((node) => `${node.label} ${node.description}`.toLocaleLowerCase().includes(normalized))
        .map((node) => node.id));
      const related = new Set(data.relations
        .filter((relation) => matches.has(relation.source) || matches.has(relation.target))
        .flatMap((relation) => [relation.source, relation.target]));
      nodes = nodes.filter((node) => matches.has(node.id) || related.has(node.id));
    }
    const ids = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      relations: view === "communities"
        ? []
        : data.relations.filter((relation) =>
          ids.has(relation.source)
          && ids.has(relation.target)
          && !relationKinds.includes(relation.kind)),
    };
  }, [data, evidenceFocusId, hiddenKinds, query, view]);

  useEffect(() => {
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) {
      setSelectedId("");
    }
  }, [graph.nodes, selectedId]);

  const selected = graph.nodes.find((node) => node.id === selectedId);
  const evidenceMap = new Map(data?.textUnits.map((unit) => [unit.id, unit]) ?? []);
  const connectedRelations = graph.relations.filter(
    (relation) => relation.source === selectedId || relation.target === selectedId,
  );
  const visibleKinds = [...new Set((data?.nodes ?? [])
    .filter((node) => {
      if (view === "semantic") return node.kind !== "Evidence" && node.kind !== "Community";
      if (view === "communities") return node.kind !== "Evidence";
      return node.kind === "Evidence" || node.kind === "Claim" || node.evidenceIds.length > 0;
    })
    .map((node) => node.kind))];

  useEffect(() => {
    if (!canvasRef.current || graph.nodes.length === 0) return;
    cyRef.current?.destroy();
    const graphIds = new Set(graph.nodes.map((node) => node.id));
    const orderedNodes = view === "communities"
      ? graph.nodes.slice().sort((a, b) =>
        Number(b.kind === "Community") - Number(a.kind === "Community"))
      : graph.nodes;
    const communityPositions = new Map<string, { x: number; y: number }>();
    if (view === "communities") {
      (data?.communities ?? []).forEach((community, communityIndex) => {
        const memberIds = community.memberIds.filter((id) => graphIds.has(id));
        const centerX = 190 + (communityIndex % 2) * 380;
        const centerY = 145 + Math.floor(communityIndex / 2) * 270;
        const radius = memberIds.length <= 1 ? 0 : Math.min(112, 50 + memberIds.length * 8);
        memberIds.forEach((id, memberIndex) => {
          const angle = (Math.PI * 2 * memberIndex) / Math.max(1, memberIds.length) - Math.PI / 2;
          communityPositions.set(id, {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          });
        });
      });
    }
    const elements: ElementDefinition[] = [
      ...orderedNodes.map((node) => ({
        data: {
          ...node,
          label: node.label.length > 16 ? `${node.label.slice(0, 16)}…` : node.label,
          ...(view === "communities"
            && node.kind !== "Community"
            && node.communityId
            && graphIds.has(node.communityId)
            ? { parent: node.communityId }
            : {}),
        },
        ...(communityPositions.has(node.id) ? { position: communityPositions.get(node.id) } : {}),
      })),
      ...graph.relations.map((relation) => ({ data: relation })),
    ];
    const cy = cytoscape({
      container: canvasRef.current,
      elements,
      style: GRAPH_STYLE,
      minZoom: 0.35,
      maxZoom: 2.5,
      wheelSensitivity: 0.22,
      layout: view === "communities"
        ? { name: "preset", fit: true, padding: 48 }
        : view === "evidence"
          ? { name: "breadthfirst", directed: true, spacingFactor: 1.35, animate: false }
          : {
            name: "cose",
            animate: false,
            componentSpacing: 80,
            nodeRepulsion: () => 11000,
            idealEdgeLength: () => 100,
          },
    });
    cy.on("tap", "node", (event) => setSelectedId(event.target.id()));
    cy.on("tap", (event) => {
      if (event.target === cy) setSelectedId("");
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [expanded, graph, view]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("dimmed selected focused");
    if (!selectedId || !cy.getElementById(selectedId).length) return;
    const node = cy.getElementById(selectedId);
    const neighborhood = node.closedNeighborhood();
    cy.elements().not(neighborhood).addClass("dimmed");
    node.addClass("selected");
    node.connectedEdges().addClass("focused");
  }, [selectedId, graph]);

  useEffect(() => {
    const resize = window.requestAnimationFrame(() => {
      cyRef.current?.resize();
      cyRef.current?.fit(undefined, expanded ? 48 : 32);
    });
    return () => window.cancelAnimationFrame(resize);
  }, [expanded, selectedId]);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  const toggleKind = (kind: OntologyKind) => {
    setHiddenKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const switchView = (next: GraphView) => {
    setSelectedId("");
    setView(next);
  };

  if (loading) {
    return (
      <div className="graph-state">
        <RefreshCw className="spin" size={22} />
        <b>正在从 Neo4j 读取图谱</b>
        <span>加载实体、Claim、证据与社区结构</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-state error">
        <Database size={22} />
        <b>{error}</b>
        <span>请确认本地 Neo4j 容器已启动。</span>
        <button className="secondary-button" onClick={() => void loadGraph()}>
          <RefreshCw size={15} />
          重试连接
        </button>
      </div>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="graph-state">
        <Network size={22} />
        <b>等待生成知识图谱</b>
        <span>先运行“深度理解”，完成后会将 Ontology v2 写入 Neo4j。</span>
      </div>
    );
  }

  const graphContent = (
    <div className={`knowledge-graph ${expanded ? "expanded" : ""}`}>
      <div className="graph-toolbar">
        <strong>
          <Network size={15} />
          Video Ontology
        </strong>
        <div className="graph-view-switch" aria-label="图谱视图">
          <button className={view === "semantic" ? "active" : ""} onClick={() => switchView("semantic")}>
            <Network size={13} />语义网络
          </button>
          <button className={view === "communities" ? "active" : ""} onClick={() => switchView("communities")}>
            <Layers3 size={13} />社区地图
          </button>
          <button className={view === "evidence" ? "active" : ""} onClick={() => switchView("evidence")}>
            <Focus size={13} />证据链
          </button>
        </div>
        <span className="graph-source">
          <Database size={13} />
          {view === "communities"
            ? `Neo4j · ${data?.communities.length ?? 0} 社区 · ${graph.nodes.length - (data?.communities.length ?? 0)} 成员`
            : `Neo4j · ${graph.nodes.length} 节点 · ${graph.relations.length} 关系`}
        </span>
        <div className="graph-actions">
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)} title="放大"><ZoomIn size={15} /></button>
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.2)} title="缩小"><ZoomOut size={15} /></button>
          <button onClick={() => cyRef.current?.fit(undefined, 32)} title="适应画布"><Focus size={15} /></button>
          <button onClick={() => setExpanded((current) => !current)} title={expanded ? "退出全屏" : "展开图谱"}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button onClick={() => void loadGraph()} title="刷新图谱"><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="graph-filterbar">
        <label>
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选实体或证据" />
        </label>
        <div className="graph-legend">
          {visibleKinds.map((kind) => (
            <button
              className={`kind-${kind.toLowerCase()} ${hiddenKinds.has(kind) ? "off" : ""}`}
              key={kind}
              onClick={() => toggleKind(kind)}
            >
              <i />{KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className={`graph-layout ${selected ? "has-detail" : ""}`}>
        <div className="graph-canvas" ref={canvasRef} />

        {selected && (
          <aside className="graph-detail">
            <span className={`graph-kind ${selected.kind.toLowerCase()}`}>
              {KIND_LABELS[selected.kind]} · {STATUS_LABELS[selected.status] ?? selected.status}
            </span>
            <h3>{selected.label}</h3>
            <p>{selected.description || "暂无补充描述"}</p>
            {selected.timecode && <div>
              <span><Timer size={14} />证据时间码</span>
              <b>{selected.timecode}</b>
            </div>}
            <div>
              <span>理解置信度</span>
              <b>{selected.score}%</b>
            </div>
            {selected.communityId && <div>
              <span>所属社区</span>
              <b>{selected.communityId.replace("community-", "#")}</b>
            </div>}
            <section className="graph-detail-relations">
              <span>关联关系</span>
              {connectedRelations.slice(0, 8).map((relation) => (
                <button
                  key={relation.id}
                  onClick={() => setSelectedId(
                    relation.source === selected.id ? relation.target : relation.source)}
                >
                  <small>{relation.label}</small>
                  <b>{graph.nodes.find((node) =>
                    node.id === (relation.source === selected.id ? relation.target : relation.source))?.label}</b>
                </button>
              ))}
            </section>
            {selected.evidenceIds.length > 0 && <section className="graph-evidence-list">
              <span>原始证据</span>
              {selected.evidenceIds.map((id) => {
                const evidence = evidenceMap.get(id);
                return evidence ? (
                  <button key={id} onClick={() => {
                    setView("evidence");
                    setSelectedId(id);
                  }}>
                    <b>{id} · {evidence.start.toFixed(1)}–{evidence.end.toFixed(1)}s</b>
                    <small>{evidence.text}</small>
                  </button>
                ) : null;
              })}
            </section>}
          </aside>
        )}
      </div>
      <footer className="graph-method">
        实体归一 + Claim/Evidence + Louvain 社区检测 · 参考 LightRAG / GraphRAG 数据流
      </footer>
    </div>
  );
  return expanded ? createPortal(graphContent, document.body) : graphContent;
}
