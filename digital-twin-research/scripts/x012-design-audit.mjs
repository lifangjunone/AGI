#!/usr/bin/env node

const Z_975 = 1.959963984540054;

function binomialPmf(n, p) {
  const probabilities = Array(n + 1).fill(0);
  probabilities[0] = (1 - p) ** n;
  for (let x = 0; x < n; x += 1) {
    probabilities[x + 1] =
      probabilities[x] * ((n - x) / (x + 1)) * (p / (1 - p));
  }
  return probabilities;
}

function exactTwoProportion(nPerCondition, pControl, pTreatment) {
  const control = binomialPmf(nPerCondition, pControl);
  const treatment = binomialPmf(nPerCondition, pTreatment);
  let rejectionProbability = 0;
  let positiveDirectionProbability = 0;

  for (let x0 = 0; x0 <= nPerCondition; x0 += 1) {
    for (let x1 = 0; x1 <= nPerCondition; x1 += 1) {
      const weight = control[x0] * treatment[x1];
      const difference = (x1 - x0) / nPerCondition;
      if (difference > 0) positiveDirectionProbability += weight;

      const pooled = (x0 + x1) / (2 * nPerCondition);
      const standardError = Math.sqrt(
        pooled * (1 - pooled) * (2 / nPerCondition),
      );
      const z = standardError === 0 ? 0 : difference / standardError;
      if (Math.abs(z) > Z_975) rejectionProbability += weight;
    }
  }

  return {
    power: rejectionProbability,
    positiveDirectionProbability,
  };
}

function probabilityAtLeastTwoOfThree(probability) {
  return (
    3 * probability ** 2 * (1 - probability) + probability ** 3
  );
}

function approximateSamplePerCondition(pControl, pTreatment, targetPower = 0.8) {
  if (targetPower !== 0.8) {
    throw new Error("Only the preregistered 80% planning target is supported");
  }
  const zPower = 0.8416212335729143;
  const pooled = (pControl + pTreatment) / 2;
  const numerator =
    Z_975 * Math.sqrt(2 * pooled * (1 - pooled)) +
    zPower *
      Math.sqrt(
        pControl * (1 - pControl) +
          pTreatment * (1 - pTreatment),
      );
  return Math.ceil((numerator / (pTreatment - pControl)) ** 2);
}

function percentage(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function contributionMarginRatio({
  priceRatio,
  refundRate,
  paymentFeeRate,
  reviewCount,
  reviewMinutes,
  consultationMinutes,
  otherVariableCostRatio,
  acquisitionCostRatio,
}) {
  return (
    priceRatio * (1 - refundRate - paymentFeeRate) -
    (reviewCount * reviewMinutes) / consultationMinutes -
    otherVariableCostRatio -
    acquisitionCostRatio
  );
}

console.log("# X-012 design audit");
console.log("\n## Paid-conversion power");
console.log(
  "\n| Anonymous rate | Named rate | Pooled identity n=120/condition | A vs B n=60/arm | Per expert n=40/condition |",
);
console.log("| ---: | ---: | ---: | ---: | ---: |");

for (const p0 of [0.05, 0.1, 0.2, 0.3, 0.4]) {
  const p1 = p0 + 0.2;
  const pooled = exactTwoProportion(120, p0, p1);
  const conditional = exactTwoProportion(60, p0, p1);
  const expert = exactTwoProportion(40, p0, p1);
  console.log(
    `| ${percentage(p0)} | ${percentage(p1)} | ${percentage(pooled.power)} | ${percentage(conditional.power)} | ${percentage(expert.power)} |`,
  );
}

console.log("\n## Direction check is not replication");
console.log(
  "\n| True per-expert effect | Baseline | One expert positive | At least 2/3 positive |",
);
console.log("| ---: | ---: | ---: | ---: |");
for (const [effect, p0] of [
  [0, 0.1],
  [0, 0.3],
  [0.2, 0.1],
  [0.2, 0.3],
]) {
  const result = exactTwoProportion(40, p0, p0 + effect);
  console.log(
    `| ${percentage(effect)} | ${percentage(p0)} | ${percentage(result.positiveDirectionProbability)} | ${percentage(probabilityAtLeastTwoOfThree(result.positiveDirectionProbability))} |`,
  );
}

console.log("\n## Repeat-use power for a 1.5x relative lift");
console.log("\n| Anonymous rate | Named rate | n=120/condition |");
console.log("| ---: | ---: | ---: |");
for (const p0 of [0.1, 0.2, 0.3, 0.4]) {
  const p1 = p0 * 1.5;
  const result = exactTwoProportion(120, p0, p1);
  console.log(
    `| ${percentage(p0)} | ${percentage(p1)} | ${percentage(result.power)} |`,
  );
}

console.log("\n## Approximate X-012B sample for 80% repeat-use power");
console.log(
  "\n| Anonymous rate | Named rate | Participants per identity condition | Total participants |",
);
console.log("| ---: | ---: | ---: | ---: |");
for (const p0 of [0.1, 0.2, 0.3, 0.4]) {
  const p1 = p0 * 1.5;
  const perCondition = approximateSamplePerCondition(p0, p1);
  console.log(
    `| ${percentage(p0)} | ${percentage(p1)} | ${perCondition} | ${perCondition * 2} |`,
  );
}

console.log("\n## Normalized contribution-margin sensitivity");
console.log(
  "\nAssumptions: 60-minute reference consultation, 5-minute review, 10% refund, 3% payment fee, and other variable cost equal to 2% of the reference consultation price. Acquisition cost is zero in this table.",
);
console.log(
  "\n| Offer as share of consultation | Signed reviews | Margin as share of consultation |",
);
console.log("| ---: | ---: | ---: |");
for (const priceRatio of [0.05, 0.1, 0.15, 0.2]) {
  for (const reviewCount of [1, 4]) {
    const margin = contributionMarginRatio({
      priceRatio,
      refundRate: 0.1,
      paymentFeeRate: 0.03,
      reviewCount,
      reviewMinutes: 5,
      consultationMinutes: 60,
      otherVariableCostRatio: 0.02,
      acquisitionCostRatio: 0,
    });
    console.log(
      `| ${percentage(priceRatio)} | ${reviewCount} | ${percentage(margin)} |`,
    );
  }
}

console.log(
  "\nThis script is a design sensitivity check, not observed evidence. Formal analysis must use the frozen participant data and preregistered model.",
);
