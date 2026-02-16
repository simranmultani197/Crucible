// ---------------------------------------------------------------------------
// MCP Registry Client — searches the official MCP Registry for safe servers
// ---------------------------------------------------------------------------

import {
  MCP_REGISTRY_URL,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_CALL_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_CHARS,
  MAX_SERVERS_PER_DISCOVERY,
  type MCPServerConfig,
} from './config'

// ---------------------------------------------------------------------------
// Registry API response types
// ---------------------------------------------------------------------------

interface RegistryEnvVar {
  name: string
  description?: string
  isRequired?: boolean
  isSecret?: boolean
}

interface RegistryPackage {
  registryType: string // "npm", "pypi", "oci", "nuget"
  identifier: string // npm package name
  version?: string
  runtimeHint?: string // "npx", "uvx", "python"
  transport: {
    type: string // "stdio", "sse", "streamable-http"
  }
  environmentVariables?: RegistryEnvVar[]
  runtimeArguments?: Array<{ value: string }>
  packageArguments?: Array<{ value: string }>
}

interface RegistryServer {
  name: string
  description?: string
  title?: string
  version: string
  packages?: RegistryPackage[]
  remotes?: Array<{
    type: string
    url: string
    headers?: Array<{ isRequired?: boolean; isSecret?: boolean }>
  }>
}

interface RegistryEntry {
  server: RegistryServer
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: string
      isLatest?: boolean
    }
  }
}

interface RegistryResponse {
  servers: RegistryEntry[]
  metadata: {
    count: number
    nextCursor?: string
  }
}

// ---------------------------------------------------------------------------
// Stop words for keyword extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'but', 'not', 'this', 'that', 'with', 'from', 'by',
  'be', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'can', 'what', 'when', 'where', 'how', 'who', 'which', 'why',
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'they', 'them',
  'tell', 'show', 'get', 'give', 'make', 'find', 'please', 'help',
  'want', 'need', 'like', 'know', 'about', 'some', 'any', 'all',
  'just', 'also', 'very', 'much', 'right', 'now', 'here', 'there',
  'up', 'out', 'if', 'then', 'so', 'than', 'too', 'only', 'same',
  'other', 'into', 'its', 'no', 'yes', 'ok', 'hi', 'hello',
])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract meaningful search keywords from a user query.
 * Removes stop words, keeps the top 2-3 content words.
 */
export function extractKeywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))

  // Deduplicate and take top 3
  const unique = Array.from(new Set(words))
  return unique.slice(0, 3)
}

/**
 * Search the official MCP Registry for safe, free, auto-connectable servers.
 * Only returns npm/stdio servers with no required API keys.
 */
export async function searchRegistry(
  keyword: string
): Promise<MCPServerConfig[]> {
  try {
    const url = `${MCP_REGISTRY_URL}/servers?search=${encodeURIComponent(keyword)}&limit=10`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      console.warn(`[MCP Registry] Search failed for "${keyword}": ${response.status}`)
      return []
    }

    const data = (await response.json()) as RegistryResponse

    if (!data.servers || data.servers.length === 0) {
      return []
    }

    const configs: MCPServerConfig[] = []

    for (const entry of data.servers) {
      const config = filterAndBuildConfig(entry)
      if (config) {
        configs.push(config)
      }
      if (configs.length >= MAX_SERVERS_PER_DISCOVERY) break
    }

    return configs
  } catch (error) {
    console.warn(`[MCP Registry] Search error for "${keyword}":`, error)
    return []
  }
}

/**
 * Search registry with multiple keywords and deduplicate results.
 */
export async function discoverServers(
  query: string
): Promise<MCPServerConfig[]> {
  const keywords = extractKeywords(query)

  if (keywords.length === 0) {
    return []
  }

  // Search for each keyword in parallel
  const results = await Promise.allSettled(
    keywords.map((kw) => searchRegistry(kw))
  )

  // Flatten and deduplicate by server id
  const seen = new Set<string>()
  const configs: MCPServerConfig[] = []

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const config of result.value) {
      if (!seen.has(config.id)) {
        seen.add(config.id)
        configs.push(config)
      }
    }
  }

  // Cap at MAX_SERVERS_PER_DISCOVERY
  return configs.slice(0, MAX_SERVERS_PER_DISCOVERY)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Filter a registry entry and build an MCPServerConfig if it passes safety checks.
 * Returns null if the server is not safe for auto-connection.
 */
function filterAndBuildConfig(entry: RegistryEntry): MCPServerConfig | null {
  const server = entry.server
  const meta = entry._meta?.['io.modelcontextprotocol.registry/official']

  // Only latest versions
  if (meta && meta.isLatest === false) {
    return null
  }

  // Must have packages (stdio transport)
  if (!server.packages || server.packages.length === 0) {
    return null
  }

  // Find the first npm/stdio package with no required secrets
  const safePkg = server.packages.find((pkg) => {
    // Must be npm (we can run with npx)
    if (pkg.registryType !== 'npm') return false

    // Must be stdio transport
    if (pkg.transport?.type !== 'stdio') return false

    // Must not require API keys
    if (pkg.environmentVariables?.some((v) => v.isRequired && v.isSecret)) {
      return false
    }

    // Must have a valid package identifier
    if (!pkg.identifier || pkg.identifier.trim() === '') return false

    return true
  })

  if (!safePkg) {
    return null
  }

  // Build the args array: npx -y <package> [packageArguments...]
  const args = ['-y', safePkg.identifier]
  if (safePkg.packageArguments) {
    args.push(...safePkg.packageArguments.map((a) => a.value))
  }

  // Build optional env vars (only non-secret, non-required ones with defaults)
  const env: Record<string, string> = {}
  if (safePkg.environmentVariables) {
    for (const envVar of safePkg.environmentVariables) {
      if (!envVar.isRequired && !envVar.isSecret && envVar.name) {
        // Skip — don't pass optional env vars to keep things clean
      }
    }
  }

  return {
    id: server.name,
    displayName: server.title || server.name.split('/').pop() || server.name,
    command: 'npx',
    args,
    env: Object.keys(env).length > 0 ? env : undefined,
    connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
    callTimeoutMs: DEFAULT_CALL_TIMEOUT_MS,
    maxOutputChars: DEFAULT_MAX_OUTPUT_CHARS,
  }
}
