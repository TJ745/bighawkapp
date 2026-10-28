/**
 * Which customer a request came for, read from the address.
 *
 * This is the piece that lets one deployment serve many companies. Everything else — the schema,
 * the filter, every query — has been per-company for a while; what was missing was any way to
 * tell, before somebody signs in, *whose* login screen and branding to show.
 *
 * A subdomain of a configured base domain names the company's `slug`:
 *
 *     acme.bighawk.sa   → "acme"
 *     bighawk.sa        → null (the deployment itself)
 *     localhost:3000    → null (development)
 *
 * Pure and client-safe, with no environment of its own, so the rule can be read and tested
 * without a request. `TENANT_BASE_DOMAIN` being unset means host-based routing is off and the
 * deployment serves one company — which is the honest state of most installs.
 */

/** Hosts that are the deployment itself rather than a customer. */
const NOT_A_TENANT = new Set(["www", "app", "admin", "api", "static", "assets"]);

/**
 * The company slug in a host, or null when there is not one.
 *
 * Returns null rather than guessing in every uncertain case: the caller's fallback is "the one
 * company this deployment has", and a wrong guess here would serve one customer another's
 * branding before anybody had even signed in.
 */
export function companySlugFromHost(host: string | null | undefined, baseDomain: string | null | undefined): string | null {
  if (!host || !baseDomain) return null;

  // The port is not part of the name, and a host is case-insensitive.
  const name = host.trim().toLowerCase().split(":")[0];
  const base = baseDomain.trim().toLowerCase().replace(/^\.+/, "").split(":")[0];
  if (!name || !base) return null;

  // An IP address has no subdomains to read, whatever it is pointed at.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes("[")) return null;

  if (name === base) return null;
  if (!name.endsWith(`.${base}`)) return null;

  const prefix = name.slice(0, -(base.length + 1));
  // Only a single label is a tenant. `a.b.bighawk.sa` is somebody's mistake, not a customer.
  if (!prefix || prefix.includes(".")) return null;
  if (NOT_A_TENANT.has(prefix)) return null;
  // The same shape a slug is allowed to take, so an impossible one never reaches a query.
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(prefix)) return null;

  return prefix;
}
