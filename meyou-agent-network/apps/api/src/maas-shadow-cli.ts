import { maasShadow } from "./maas-shadow.js";

const result = await maasShadow(process.env, process.argv.includes("--confirm-inference"));
console.log(JSON.stringify(result));
process.exitCode = result.ok ? 0 : 1;
