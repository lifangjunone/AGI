# Open-source product foundation

This directory contains the upstream projects evaluated for the Agent Workforce
Lab product pivot.

## Runtime foundation

### MyContext

- Repository: <https://github.com/openTrinity/mycontext>
- Pinned commit: `23c6f609fb1d392f922e19dae7bee174075a2569`
- License: Elastic License 2.0
- Role: the runnable local-first desktop foundation for source authorization,
  incremental ingestion, SQLite storage, evidence retrieval, context graph, and
  digital-self experiences.

The source is kept as its own upstream checkout under `open-source/mycontext`.
Do not copy its packages into the legacy FastAPI/React application. Product
extensions must use explicit adapter boundaries so the upstream can be updated
or replaced.

Elastic License 2.0 permits internal use and modification, but restricts
offering a substantial set of the software's features as a hosted or managed
service to third parties. Preserve upstream notices and complete legal review
before external commercialization.

## Research-only source

### digital-twin-skill

- Repository: <https://github.com/FredHJC/digital-twin-skill>
- Reviewed commit: `85ff9befd02ed556241d43a3e3d2f999aa1a4436`
- License: no license file was found at the reviewed commit
- Role: research reference for ingestion, PII scrubbing, behavioral extraction,
  incremental import, and Skill output.

Because no license grant was found, none of its code may be copied, packaged, or
imported by the product. It remains a local research checkout only.

## Product-owned scope

Product code should implement only the differentiated work-twin layer:

1. reconstruct `problem → judgment → action → result → adjustment`;
2. separate sourced facts, inferred methods, boundaries, and confirmations;
3. evaluate methods against subsequent real work outcomes;
4. grant progressively scoped work authority;
5. support dynamic help and collaboration during a task.
