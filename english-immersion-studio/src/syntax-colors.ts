export type SyntaxColorRole =
  | "subject"
  | "predicate"
  | "object"
  | "complement"
  | "adverbial"
  | "modifier"
  | "question"
  | "context";

export function getSyntaxColorRole(role: string): SyntaxColorRole {
  if (role.includes("主语")) return "subject";
  if (role.includes("谓语")) return "predicate";
  if (role.includes("宾语")) return "object";
  if (role.includes("表语") || role.includes("补语")) return "complement";
  if (role.includes("状语")) return "adverbial";
  if (role.includes("定语")) return "modifier";
  if (role.includes("疑问") || role.includes("助动")) return "question";
  return "context";
}

export function getSyntaxRoleLabel(role: string): string {
  if (role === "宾语/补充") return "宾语";
  if (role === "状语/补充") return "状语";
  if (role === "寒暄/话语标记") return "完整语块";
  return role;
}
