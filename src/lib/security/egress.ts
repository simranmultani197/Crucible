interface EgressPolicyResult {
  enabled: boolean
  allowlist: string[]
  detectedHosts: string[]
  blockedHosts: string[]
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
}

function parseAllowlist(): string[] {
  const raw = process.env.SANDBOX_EGRESS_ALLOWLIST || ''
  return raw
    .split(',')
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0)
}

function extractHosts(code: string): string[] {
  const matches = Array.from(
    code.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?/g)
  )
  return Array.from(new Set(matches.map((m) => normalizeHost(m[1] || '')))).filter(Boolean)
}

function isAllowedHost(host: string, allowlist: string[]): boolean {
  const normalized = normalizeHost(host)
  for (const entry of allowlist) {
    if (!entry) continue
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2)
      if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
        return true
      }
      continue
    }
    if (normalized === entry) {
      return true
    }
  }
  return false
}

export function evaluateEgressPolicy(code: string): EgressPolicyResult {
  const allowlist = parseAllowlist()
  const enabled = allowlist.length > 0
  const detectedHosts = extractHosts(code)

  if (!enabled || detectedHosts.length === 0) {
    return {
      enabled,
      allowlist,
      detectedHosts,
      blockedHosts: [],
    }
  }

  const blockedHosts = detectedHosts.filter((host) => !isAllowedHost(host, allowlist))
  return {
    enabled,
    allowlist,
    detectedHosts,
    blockedHosts,
  }
}
