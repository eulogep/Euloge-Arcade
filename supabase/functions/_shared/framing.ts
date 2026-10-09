// Pure helper (no Deno APIs) so it is unit-tested with Vitest too.

/** Does the response allow being framed by `ourHost`? */
export function framingAllowed(headers: Headers, ourHost: string | null): boolean {
  const xfo = headers.get('x-frame-options')?.toLowerCase().trim();
  if (xfo === 'deny' || xfo === 'sameorigin') return false;
  const csp = headers.get('content-security-policy') ?? '';
  const directive = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  if (!directive) return true;
  const sources = directive.split(/\s+/).slice(1).map((s) => s.toLowerCase());
  if (sources.includes("'none'")) return false;
  if (sources.includes('*') || sources.includes('https:')) return true;
  if (!ourHost) return false;
  return sources.some((s) => {
    const host = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return host === ourHost || (host.startsWith('*.') && ourHost.endsWith(host.slice(1)));
  });
}
