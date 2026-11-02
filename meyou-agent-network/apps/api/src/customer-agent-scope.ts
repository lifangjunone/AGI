/** Optional invite-beta restriction. An invalid/nonempty list fails closed. */
export function customerAgentOrganizations(): string[] | null {
  const configured = process.env.CUSTOMER_AGENT_ORGANIZATIONS;
  if (configured === undefined || configured.trim() === "") return null;
  return configured.split(",").map(id => id.trim())
    .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

export function customerAgentInScope(organizationId: string) {
  const allowed = customerAgentOrganizations();
  return allowed === null || allowed.includes(organizationId);
}
