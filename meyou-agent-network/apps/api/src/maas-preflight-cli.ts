import { maasPreflight } from "./maas-preflight.js";

const result = await maasPreflight(process.env);
console.log(JSON.stringify(result));
process.exitCode = result.ok ? 0 : 1;
