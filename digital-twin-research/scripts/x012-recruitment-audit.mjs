#!/usr/bin/env node

const targetAssigned = 240;
const enrollmentRate = 0.8;

function integer(value) {
  return Math.ceil(value).toLocaleString("en-US");
}

function money(value) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function percentage(value) {
  return `${(value * 100).toFixed(0)}%`;
}

console.log("# X-012 recruitment audit");

console.log("\n## Neutral-funnel sensitivity");
console.log(
  "\nAssumption: 240 assigned participants and 80% of eligible prospects complete enrollment.",
);
console.log(
  "\n| Eligibility incidence | Completed screeners or qualified leads required |",
);
console.log("| ---: | ---: |");
for (const incidence of [0.05, 0.1, 0.2, 0.4]) {
  console.log(
    `| ${percentage(incidence)} | ${integer(targetAssigned / (incidence * enrollmentRate))} |`,
  );
}

console.log("\n## Published panel recruitment fees");
console.log(
  "\nThese are recruitment or platform costs, not product revenue and not steady-state customer acquisition evidence.",
);
console.log(
  "\n| Channel | Published fee basis | Cost for 240 completed participants | Participant incentives included |",
);
console.log("| --- | ---: | ---: | --- |");
console.log(
  `| User Interviews B2C PAYG | $45/session | ${money(45 * targetAssigned)} | No |`,
);
console.log(
  `| Respondent B2C unmoderated PAYG | $25/session | ${money(25 * targetAssigned)} | No |`,
);

const rewardPerParticipant = 3;
console.log(
  `| Prolific corporate, illustrative $${rewardPerParticipant} reward | 42.857% on reward | ${money(targetAssigned * rewardPerParticipant * (1 + 0.42857))} | Yes |`,
);
console.log(
  `| CloudResearch Connect corporate, illustrative $${rewardPerParticipant} reward | 40% on reward | ${money(targetAssigned * rewardPerParticipant * 1.4)} | Yes |`,
);

console.log("\n## Maximum acquisition cost per assigned visitor");
console.log(
  "\nThe break-even relationship is: max acquisition cost per assigned visitor = paid conversion x pre-acquisition contribution per payer.",
);
console.log(
  "\n| Paid conversion | Pre-acquisition contribution as share of price | Max acquisition cost as share of price |",
);
console.log("| ---: | ---: | ---: |");
for (const conversion of [0.1, 0.2, 0.3]) {
  for (const contribution of [0.2, 0.4, 0.6]) {
    console.log(
      `| ${percentage(conversion)} | ${percentage(contribution)} | ${percentage(conversion * contribution)} |`,
    );
  }
}

console.log(
  "\nThis script is a planning sensitivity check. It does not prove eligibility incidence, conversion, channel approval, or demand.",
);
