import { describe, expect, it } from "vitest";
import { buildOntology } from "./ontology";

describe("video ontology", () => {
  it("deduplicates entities and links claims to source evidence", () => {
    const graph = buildOntology({
      entities: [
        {
          id: "host",
          kind: "Person",
          label: "主持人",
          aliases: ["主播"],
          description: "画面中的讲述者",
          confidence: 88,
          evidence_ids: ["asr-1", "visual-1"],
        },
        {
          id: "speaker",
          kind: "Person",
          label: "主持人",
          description: "正在介绍产品",
          confidence: 92,
          evidence_ids: ["visual-1"],
        },
        {
          id: "product",
          kind: "Object",
          label: "产品",
          description: "被展示的物品",
          confidence: 90,
          evidence_ids: ["visual-1"],
        },
      ],
      claims: [{
        statement: "主持人正在介绍产品",
        subject: "host",
        predicate: "INTRODUCES",
        object: "product",
        confidence: 91,
        status: "supported",
        evidence_ids: ["asr-1", "visual-1"],
      }],
      relations: [{
        source: "host",
        target: "product",
        kind: "PRESENTS",
        label: "展示",
        weight: 2,
        evidence_ids: ["visual-1"],
      }],
    }, [{
      id: "moment-1",
      start: 0,
      end: 4,
      title: "产品展示",
      transcript: "这是今天的产品",
      evidence: "人物手持产品",
      score: 90,
    }], [{
      start: 0,
      end: 3,
      speaker: "说话人",
      text: "这是今天的产品",
      confidence: 96,
    }]);

    expect(graph.schemaVersion).toBe("video-ontology-v2");
    expect(graph.nodes.filter((node) => node.kind === "Person")).toHaveLength(1);
    expect(graph.nodes.some((node) => node.kind === "Claim")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "Evidence" && node.id === "asr-1")).toBe(true);
    expect(graph.relations.some((relation) =>
      relation.source === "asr-1" && relation.kind === "SUPPORTS")).toBe(true);
    expect(graph.communities.length).toBeGreaterThan(0);
    expect(graph.relations.some((relation) => relation.kind === "IN_COMMUNITY")).toBe(true);
  });

  it("drops relation endpoints and evidence IDs that do not exist", () => {
    const graph = buildOntology({
      entities: [{
        id: "person-1",
        kind: "Person",
        label: "人物1",
        evidence_ids: ["missing"],
      }],
      relations: [{
        source: "person-1",
        target: "missing-node",
        kind: "KNOWS",
        evidence_ids: ["missing"],
      }],
    }, [], []);

    expect(graph.relations.some((relation) => relation.kind === "KNOWS")).toBe(false);
    expect(graph.nodes.find((node) => node.id === "person-1")).toBeUndefined();
  });
});
