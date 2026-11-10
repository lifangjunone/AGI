#!/usr/bin/env node

function wilsonLower(successes, total, z = 1.2815515655446004) {
  if (!Number.isInteger(successes) || !Number.isInteger(total)) {
    throw new Error("successes and total must be integers");
  }
  if (total <= 0 || successes < 0 || successes > total) {
    throw new Error("require 0 <= successes <= total and total > 0");
  }

  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin =
    z *
    Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return Math.max(0, (center - margin) / denominator);
}

function requiredScreens(rateLower, enrollmentRate, targetPerStratum = 40) {
  if (rateLower <= 0) return Infinity;
  return Math.ceil(targetPerStratum / (rateLower * enrollmentRate));
}

function percentage(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function usage() {
  console.log(`# X-012 candidate-level channel density gate

Usage:
  node scripts/x012-channel-density-gate.mjs <screened> <aware_nonbuyer> <unaware_adjacent_buyer> [enrollment_rate] [approved_screen_cap]

The script uses one-sided 90% Wilson lower bounds. The minimum 50-screen preflight
is diagnostic only. PASS requires both relationship strata to fit within the
approved screening cap.
`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(0);
}

if (args.length < 3 || args.length > 5) {
  usage();
  process.exit(1);
}

const screened = Number(args[0]);
const aware = Number(args[1]);
const adjacent = Number(args[2]);
const enrollmentRate = args[3] === undefined ? 0.8 : Number(args[3]);
const approvedScreenCap =
  args[4] === undefined ? Number.POSITIVE_INFINITY : Number(args[4]);

if (
  !Number.isInteger(screened) ||
  !Number.isInteger(aware) ||
  !Number.isInteger(adjacent) ||
  aware + adjacent > screened ||
  !(enrollmentRate > 0 && enrollmentRate <= 1) ||
  !(approvedScreenCap > 0)
) {
  throw new Error(
    "invalid inputs: counts must be non-negative integers, strata cannot exceed screened, and rates/caps must be positive",
  );
}

const awareLower = wilsonLower(aware, screened);
const adjacentLower = wilsonLower(adjacent, screened);
const awareRequired = requiredScreens(awareLower, enrollmentRate);
const adjacentRequired = requiredScreens(adjacentLower, enrollmentRate);
const required = Math.max(awareRequired, adjacentRequired);
const pass =
  screened >= 50 &&
  Number.isFinite(required) &&
  required <= approvedScreenCap;

console.log("# X-012 candidate-level channel density gate");
console.log(`\n- Complete neutral screens: ${screened}`);
console.log(`- Enrollment assumption: ${percentage(enrollmentRate)}`);
console.log(
  `- aware_nonbuyer: ${aware}/${screened}; one-sided 90% lower bound ${percentage(awareLower)}`,
);
console.log(
  `- unaware_adjacent_buyer: ${adjacent}/${screened}; one-sided 90% lower bound ${percentage(adjacentLower)}`,
);
console.log(
  `- Conservative screens required for aware_nonbuyer: ${Number.isFinite(awareRequired) ? awareRequired : "unbounded"}`,
);
console.log(
  `- Conservative screens required for unaware_adjacent_buyer: ${Number.isFinite(adjacentRequired) ? adjacentRequired : "unbounded"}`,
);
console.log(
  `- Approved screen cap: ${Number.isFinite(approvedScreenCap) ? approvedScreenCap : "not provided"}`,
);
console.log(`- Gate: ${pass ? "PASS" : "FAIL"}`);
console.log(
  "\nThis is a capacity gate, not evidence of demand, conversion, retention, or positive contribution margin.",
);
