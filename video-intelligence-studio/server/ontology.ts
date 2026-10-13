import Graph from "graphology";
import louvain from "graphology-communities-louvain";

export type OntologyKind =
  | "Person"
  | "Organization"
  | "Location"
  | "Object"
  | "Concept"
  | "Event"
  | "Claim"
  | "Evidence"
  | "Community";

export type OntologyNode = {
  id: string;
  kind: OntologyKind;
  label: string;
  description: string;
  timecode: string;
  start: number;
  end: number;
  score: number;
  aliases: string[];
  evidenceIds: string[];
  communityId: string;
  status: string;
};

export type OntologyRelation = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  description: string;
  weight: number;
  evidenceIds: string[];
};

export type TextUnit = {
  id: string;
  kind: "asr" | "visual";
  start: number;
  end: number;
  text: string;
};

export type CommunityReport = {
  id: string;
  level: number;
  title: string;
  summary: string;
  memberIds: string[];
  evidenceIds: string[];
  rating: number;
};

export type OntologyGraph = {
  nodes: OntologyNode[];
  relations: OntologyRelation[];
  textUnits: TextUnit[];
  communities: CommunityReport[];
  schemaVersion: "video-ontology-v2";
};

type MomentInput = {
  id: string;
  start: number;
  end: number;
  title: string;
  transcript: string;
  evidence: string;
  score: number;
};

type AudioInput = {
  start: number;
  end: number;
  speaker: string;
  text: string;
  confidence: number;
};

function valueText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function valueNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => valueText(item)).filter(Boolean)
    : [];
}

function slug(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeKind(value: unknown): Exclude<OntologyKind, "Claim" | "Evidence" | "Community"> {
  const kind = valueText(value);
  const supported = ["Person", "Organization", "Location", "Object", "Concept", "Event"];
  return supported.includes(kind)
    ? kind as Exclude<OntologyKind, "Claim" | "Evidence" | "Community">
    : "Concept";
}

function deduplicateNodes(nodes: OntologyNode[]) {
  const merged = new Map<string, OntologyNode>();
  const idMap = new Map<string, string>();
  for (const node of nodes) {
    const key = `${node.kind}:${node.label.normalize("NFKC").toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, node);
      idMap.set(node.id, node.id);
      continue;
    }
    idMap.set(node.id, existing.id);
    existing.aliases = [...new Set([...existing.aliases, ...node.aliases])];
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...node.evidenceIds])];
    existing.description = existing.description.length >= node.description.length
      ? existing.description
      : node.description;
    existing.score = Math.max(existing.score, node.score);
    existing.start = Math.min(existing.start, node.start);
    existing.end = Math.max(existing.end, node.end);
  }
  return { nodes: [...merged.values()], idMap };
}

function detectCommunities(
  nodes: OntologyNode[],
  relations: OntologyRelation[],
  evidenceById: Map<string, TextUnit>,
) {
  const semanticNodes = nodes.filter((node) => node.kind !== "Evidence" && node.kind !== "Community");
  const semanticIds = new Set(semanticNodes.map((node) => node.id));
  const graph = new Graph({ multi: false, type: "undirected", allowSelfLoops: false });
  for (const node of semanticNodes) graph.addNode(node.id);
  for (const relation of relations) {
    if (!semanticIds.has(relation.source) || !semanticIds.has(relation.target)
      || relation.source === relation.target) continue;
    if (graph.hasEdge(relation.source, relation.target)) {
      const edge = graph.edge(relation.source, relation.target);
      graph.updateEdgeAttribute(edge, "weight", (weight) => valueNumber(weight, 1) + relation.weight);
    } else {
      graph.addEdge(relation.source, relation.target, { weight: relation.weight });
    }
  }

  const assignments = graph.order > 1
    ? louvain(graph, { getEdgeWeight: "weight", resolution: 1 })
    : Object.fromEntries(semanticNodes.map((node) => [node.id, 0]));
  const groups = new Map<number, OntologyNode[]>();
  for (const node of semanticNodes) {
    const community = Number(assignments[node.id] ?? 0);
    groups.set(community, [...(groups.get(community) ?? []), node]);
  }

  const reports: CommunityReport[] = [...groups.values()].map((members, index) => {
    const evidenceIds = [...new Set(members.flatMap((node) => node.evidenceIds))]
      .filter((id) => evidenceById.has(id));
    const ranked = members.slice().sort((a, b) => b.score - a.score);
    return {
      id: `community-${index + 1}`,
      level: 0,
      title: ranked.slice(0, 3).map((node) => node.label).join(" · ") || `社区 ${index + 1}`,
      summary: ranked
        .slice(0, 5)
        .map((node) => node.description)
        .filter(Boolean)
        .join("；"),
      memberIds: members.map((node) => node.id),
      evidenceIds,
      rating: Math.round(ranked.reduce((sum, node) => sum + node.score, 0) / Math.max(1, ranked.length)),
    };
  });
  const communityByNode = new Map<string, string>();
  for (const report of reports) {
    for (const id of report.memberIds) communityByNode.set(id, report.id);
  }
  return { reports, communityByNode };
}

export function buildOntology(
  raw: Record<string, unknown>,
  moments: MomentInput[],
  audioEvidence: AudioInput[],
): OntologyGraph {
  const textUnits: TextUnit[] = [
    ...audioEvidence.map((item, index) => ({
      id: `asr-${index + 1}`,
      kind: "asr" as const,
      start: item.start,
      end: item.end,
      text: item.text,
    })),
    ...moments.map((item, index) => ({
      id: `visual-${index + 1}`,
      kind: "visual" as const,
      start: item.start,
      end: item.end,
      text: [item.title, item.transcript, item.evidence].filter(Boolean).join("："),
    })),
  ];
  const evidenceById = new Map(textUnits.map((unit) => [unit.id, unit]));
  const evidenceNodes: OntologyNode[] = textUnits.map((unit) => ({
    id: unit.id,
    kind: "Evidence",
    label: unit.kind === "asr" ? `对白 ${unit.id.slice(4)}` : `视觉证据 ${unit.id.slice(7)}`,
    description: unit.text,
    timecode: `${unit.start.toFixed(1)}s–${unit.end.toFixed(1)}s`,
    start: unit.start,
    end: unit.end,
    score: 100,
    aliases: [],
    evidenceIds: [unit.id],
    communityId: "",
    status: "observed",
  }));

  const rawEntities = [
    ...(Array.isArray(raw.entities) ? raw.entities : []),
    ...(Array.isArray(raw.nodes) ? raw.nodes : []),
    ...(Array.isArray(raw.events)
      ? raw.events.map((item) => ({ ...(item as Record<string, unknown>), kind: "Event" }))
      : []),
  ];
  const semanticNodes = rawEntities.slice(0, 80).map((item, index) => {
    const value = item as Record<string, unknown>;
    const kind = normalizeKind(value.kind ?? value.type);
    const label = valueText(value.label ?? value.name, `${kind} ${index + 1}`);
    const start = Math.max(0, valueNumber(value.start));
    const end = Math.max(start, valueNumber(value.end, start));
    return {
      id: slug(valueText(value.id, label), `${kind.toLowerCase()}-${index + 1}`),
      kind,
      label,
      description: valueText(value.description),
      timecode: valueText(value.timecode, end > start ? `${start.toFixed(1)}s–${end.toFixed(1)}s` : ""),
      start,
      end,
      score: Math.max(0, Math.min(100, valueNumber(value.score ?? value.confidence, 70))),
      aliases: stringList(value.aliases),
      evidenceIds: stringList(value.evidence_ids ?? value.evidenceIds)
        .filter((id) => evidenceById.has(id)),
      communityId: "",
      status: "extracted",
    } satisfies OntologyNode;
  }).filter((node) => node.evidenceIds.length > 0);
  const deduplicated = deduplicateNodes(semanticNodes);
  const nodeById = new Map(deduplicated.nodes.map((node) => [node.id, node]));

  const rawClaims = Array.isArray(raw.claims) ? raw.claims : [];
  const claimRows = rawClaims.slice(0, 50).map((item, index) => {
    const value = item as Record<string, unknown>;
    const evidenceIds = stringList(value.evidence_ids ?? value.evidenceIds)
      .filter((id) => evidenceById.has(id));
    return {
      raw: value,
      node: {
        id: `claim-${index + 1}`,
        kind: "Claim",
        label: valueText(value.statement ?? value.label, `判断 ${index + 1}`),
        description: valueText(value.rationale ?? value.description),
        timecode: "",
        start: 0,
        end: 0,
        score: Math.max(0, Math.min(100, valueNumber(value.confidence, 70))),
        aliases: [],
        evidenceIds,
        communityId: "",
        status: valueText(value.status, "supported"),
      } satisfies OntologyNode,
    };
  }).filter((row) => row.node.evidenceIds.length > 0);
  const claimNodes = claimRows.map((row) => row.node);

  const rawRelations = Array.isArray(raw.relations) ? raw.relations : [];
  const relations: OntologyRelation[] = rawRelations.slice(0, 120).map((item, index) => {
    const value = item as Record<string, unknown>;
    return {
      id: `relation-${index + 1}`,
      source: deduplicated.idMap.get(valueText(value.source)) ?? valueText(value.source),
      target: deduplicated.idMap.get(valueText(value.target)) ?? valueText(value.target),
      kind: valueText(value.kind, "RELATED_TO").toUpperCase(),
      label: valueText(value.label, "相关"),
      description: valueText(value.description),
      weight: Math.max(0.1, valueNumber(value.weight, 1)),
      evidenceIds: stringList(value.evidence_ids ?? value.evidenceIds)
        .filter((id) => evidenceById.has(id)),
    };
  }).filter((relation) => nodeById.has(relation.source) && nodeById.has(relation.target));

  for (const [index, row] of claimRows.entries()) {
    const value = row.raw;
    const claimNode = row.node;
    const subject = deduplicated.idMap.get(valueText(value.subject)) ?? valueText(value.subject);
    const object = deduplicated.idMap.get(valueText(value.object)) ?? valueText(value.object);
    if (nodeById.has(subject)) {
      relations.push({
        id: `claim-subject-${index + 1}`,
        source: subject,
        target: claimNode.id,
        kind: "ASSERTS",
        label: valueText(value.predicate, "提出判断"),
        description: claimNode.description,
        weight: 1,
        evidenceIds: claimNode.evidenceIds,
      });
    }
    if (nodeById.has(object)) {
      relations.push({
        id: `claim-object-${index + 1}`,
        source: claimNode.id,
        target: object,
        kind: "ABOUT",
        label: "涉及",
        description: "",
        weight: 1,
        evidenceIds: claimNode.evidenceIds,
      });
    }
  }

  const allSemantic = [...deduplicated.nodes, ...claimNodes];
  for (const node of allSemantic) {
    for (const evidenceId of node.evidenceIds) {
      relations.push({
        id: `evidence-${node.id}-${evidenceId}`,
        source: evidenceId,
        target: node.id,
        kind: "SUPPORTS",
        label: "证据支持",
        description: evidenceById.get(evidenceId)?.text ?? "",
        weight: 1,
        evidenceIds: [evidenceId],
      });
    }
  }

  const { reports, communityByNode } = detectCommunities(allSemantic, relations, evidenceById);
  for (const node of allSemantic) node.communityId = communityByNode.get(node.id) ?? "";
  const communityNodes: OntologyNode[] = reports.map((report) => ({
    id: report.id,
    kind: "Community",
    label: report.title,
    description: report.summary,
    timecode: "",
    start: 0,
    end: 0,
    score: report.rating,
    aliases: [],
    evidenceIds: report.evidenceIds,
    communityId: report.id,
    status: "detected",
  }));
  for (const report of reports) {
    for (const memberId of report.memberIds) {
      relations.push({
        id: `member-${report.id}-${memberId}`,
        source: memberId,
        target: report.id,
        kind: "IN_COMMUNITY",
        label: "归属社区",
        description: "",
        weight: 0.5,
        evidenceIds: [],
      });
    }
  }

  return {
    nodes: [...allSemantic, ...evidenceNodes, ...communityNodes],
    relations,
    textUnits,
    communities: reports,
    schemaVersion: "video-ontology-v2",
  };
}
