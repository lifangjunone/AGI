#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);
const seed = process.env.X012_RANDOMIZATION_SEED;
const allowIncomplete = process.env.X012_ALLOW_INCOMPLETE === "1";
const relationshipQuotas = new Map([
  ["aware_nonbuyer", 40],
  ["unaware_adjacent_buyer", 40],
]);

if (!inputPath || !outputPath) {
  fail("Usage: X012_RANDOMIZATION_SEED=<secret> node scripts/x012-randomize.mjs input.csv output.csv");
}

if (!seed || seed.length < 32) {
  fail("X012_RANDOMIZATION_SEED must contain at least 32 characters");
}

const source = readFileSync(inputPath, "utf8").trimEnd();
const lines = source.split(/\r?\n/);

if (lines.length < 2) {
  fail("Input must contain a header and at least one participant");
}

const header = parseCsvLine(lines[0]);
const required = [
  "participant_id",
  "expert_id",
  "relationship_stratum",
  "research_compensation_promised",
  "purchase_subsidized",
  "prior_expert_ai_exposure",
  "primary_eligible",
  "stratum_position",
];

for (const column of required) {
  if (!header.includes(column)) {
    fail(`Missing required column: ${column}`);
  }
}

if (header.includes("arm") || header.includes("randomization_block")) {
  fail("Input must not already contain arm or randomization_block columns");
}

const rows = lines.slice(1).map((line, index) => {
  const values = parseCsvLine(line);

  if (values.length !== header.length) {
    fail(`Row ${index + 2} has ${values.length} columns; expected ${header.length}`);
  }

  return Object.fromEntries(header.map((column, columnIndex) => [column, values[columnIndex]]));
});

const participantIds = new Set();
const positions = new Set();

for (const row of rows) {
  if (!row.participant_id || participantIds.has(row.participant_id)) {
    fail(`Missing or duplicate participant_id: ${row.participant_id || "(empty)"}`);
  }
  participantIds.add(row.participant_id);

  if (!relationshipQuotas.has(row.relationship_stratum)) {
    fail(`Invalid relationship_stratum for ${row.participant_id}: ${row.relationship_stratum}`);
  }

  if (
    row.research_compensation_promised !== "0" ||
    row.purchase_subsidized !== "0" ||
    row.prior_expert_ai_exposure !== "0" ||
    row.primary_eligible !== "1"
  ) {
    fail(
      `Participant ${row.participant_id} is not eligible for confirmatory randomization`,
    );
  }

  if (!/^(0|[1-9]\d*)$/.test(row.stratum_position)) {
    fail(`Invalid stratum_position for ${row.participant_id}: ${row.stratum_position}`);
  }

  const stratum = stratumKey(row);
  const positionKey = `${stratum}\u001f${row.stratum_position}`;
  if (positions.has(positionKey)) {
    fail(`Duplicate stratum_position ${row.stratum_position} in stratum ${stratum}`);
  }
  positions.add(positionKey);
}

const strata = Map.groupBy(rows, stratumKey);
const assignments = new Map();

if (!allowIncomplete) {
  validateFormalQuotas(rows);
}

for (const [stratum, stratumRows] of strata) {
  const orderedRows = [...stratumRows].sort(
    (left, right) => Number(left.stratum_position) - Number(right.stratum_position),
  );

  orderedRows.forEach((row, index) => {
    if (Number(row.stratum_position) !== index) {
      fail(`Stratum ${stratum} must use contiguous positions from 0; found ${row.stratum_position} at index ${index}`);
    }

    const block = Math.floor(index / 4);
    const slot = index % 4;
    const permutation = armPermutation(stratum, block);
    assignments.set(row.participant_id, {
      randomization_block: String(block),
      arm: permutation[slot],
    });
  });
}

const outputHeader = [...header, "randomization_block", "arm"];
const outputLines = [
  outputHeader.map(escapeCsv).join(","),
  ...rows.map((row) => {
    const assignment = assignments.get(row.participant_id);
    return [...header.map((column) => row[column]), assignment.randomization_block, assignment.arm]
      .map(escapeCsv)
      .join(",");
  }),
];

writeFileSync(outputPath, `${outputLines.join("\n")}\n`, { flag: "wx" });

function stratumKey(row) {
  return [row.expert_id, row.relationship_stratum].join("\u001f");
}

function armPermutation(stratum, block) {
  return ["A", "B", "C", "D"]
    .map((arm) => ({
      arm,
      rank: createHmac("sha256", seed)
        .update(`${stratum}\u001f${block}\u001f${arm}`)
        .digest("hex"),
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank))
    .map(({ arm }) => arm);
}

function validateFormalQuotas(participants) {
  const experts = new Map();

  for (const row of participants) {
    const counts = experts.get(row.expert_id) ?? new Map();
    counts.set(row.relationship_stratum, (counts.get(row.relationship_stratum) ?? 0) + 1);
    experts.set(row.expert_id, counts);
  }

  if (experts.size !== 3) {
    fail(`Formal input must contain exactly 3 experts; found ${experts.size}`);
  }

  for (const [expertId, counts] of experts) {
    for (const [relationship, expected] of relationshipQuotas) {
      const actual = counts.get(relationship) ?? 0;
      if (actual !== expected) {
        fail(`${expertId}/${relationship} must contain ${expected} participants; found ${actual}`);
      }
    }
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) {
    fail("Multiline or unclosed quoted CSV fields are not supported");
  }

  values.push(value);
  return values;
}

function escapeCsv(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
