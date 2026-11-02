/** Forward only the credential required by the central authentication domain.
 * Reject duplicates instead of choosing an ambiguous session.
 */
export function platformCookie(header: string | undefined, name: "lym_sso_session" | "lym_admin_session") {
  if (!header) return "";
  const matches = header.split(";").map(part => part.trim())
    .filter(part => part.slice(0, part.indexOf("=")).trim() === name);
  if (matches.length !== 1) return "";
  const value = matches[0]!.slice(matches[0]!.indexOf("=") + 1);
  if (!value || value.length > 8192 || /[\s\u0000-\u001f\u007f]/.test(value)) return "";
  return `${name}=${value}`;
}
