"""Real Semantica graph + local retriever, fed only an authorized subgraph."""
import re
from importlib.metadata import version
from semantica.context.context_graph import ContextGraph
from semantica.context.context_retriever import ContextRetriever


class Knowledge:
    def __init__(self):
        self.health = {"status": "not_checked", "version": version("semantica")}

    def graph(self, sources):
        graph = ContextGraph(extract_entities=False, extract_relationships=False,
                             advanced_analytics=False, node_embeddings=False)
        for source in sources:
            graph.add_node(source["id"], "source", content=source["text"],
                           contributor=source.get("contributor"), version=source["version"])
            graph.add_node(source["id"] + ":method", "method", content=source["method"],
                           source_id=source["id"])
            graph.add_node(source["id"] + ":condition", "condition", content=source["conditions"],
                           source_id=source["id"])
            graph.add_edge(source["id"] + ":method", source["id"], edge_type="supported_by")
            graph.add_edge(source["id"] + ":method", source["id"] + ":condition", edge_type="applies_under")
        return graph

    @staticmethod
    def wire(graph):
        # The released retriever keyword branch searches "name", not "text".
        # Explicitly map the graph's current nodes/edges to that real contract.
        serialized = graph.to_dict()
        return {
            "entities": [{"id": n["id"], "name": n["type"] + " " + (n.get("content") or ""),
                          "type": n["type"], "metadata": {"description": n.get("content", ""),
                                                        **n.get("properties", {})}}
                         for n in serialized["nodes"]],
            "relationships": [{"source_id": e["source"], "target_id": e["target"],
                               "type": e["type"]} for e in serialized["edges"]],
        }

    def retrieve(self, sources, query, max_results=5):
        if not sources:
            return []
        try:
            graph = self.graph(sources)
            wire = self.wire(graph)
            if len(wire["entities"]) != 3 * len(sources):
                raise RuntimeError("Graph projection incomplete")
            retriever = ContextRetriever(knowledge_graph=wire, use_graph_expansion=True, max_expansion_hops=1)
            tokens = re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]", query)
            result = retriever.retrieve(" ".join(tokens) or "method", mode="local",
                                        max_results=max_results * 3, use_graph_expansion=True, max_hops=1)
            # If the user's goal contains no known term, retrieve the employee's
            # authorized method baseline, not an unfiltered global graph.
            if not result:
                result = retriever.retrieve("method condition", mode="local",
                                            max_results=max_results * 3, use_graph_expansion=True, max_hops=1)
            identifiers = []
            source_lookup = {s["id"]: s for s in sources}
            for row in result:
                node_id = row.metadata.get("node_id", "")
                source_id = node_id.split(":")[0]
                if source_id in source_lookup and source_id not in identifiers:
                    identifiers.append(source_id)
            return [{"id": identifier, "title": source_lookup[identifier]["title"],
                     "text": source_lookup[identifier]["text"],
                     "method": source_lookup[identifier]["method"],
                     "conditions": source_lookup[identifier]["conditions"],
                     "version": source_lookup[identifier]["version"],
                     "fact_type": source_lookup[identifier]["fact_type"]}
                    for identifier in identifiers[:max_results]]
        except Exception:
            self.health["status"] = "error"
            raise RuntimeError("Semantica projection/retrieval failed; no fallback graph")

    def smoke(self):
        sample = {"id": "smoke", "title": "smoke", "text": "依据", "method": "依据 方法",
                  "conditions": "真人 确认", "version": 1, "fact_type": "test"}
        graph = self.graph([sample])
        restored = self.graph([])
        restored.from_dict(graph.to_dict())
        if len(restored.to_dict()["nodes"]) != 3 or not self.retrieve([sample], "依据"):
            raise RuntimeError("Semantica 0.7.0 contract smoke failed")
        self.health["status"] = "ready"
