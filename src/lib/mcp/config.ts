// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for an MCP server that Crucible can connect to.
 * Built from MCP Registry search results.
 */
export interface MCPServerConfig {
  /** Registry server name (e.g., "io.github.AlexDeMichieli/weather") */
  id: string
  /** Human-readable display name */
  displayName: string
  /** Process command to spawn (typically "npx") */
  command: string
  /** Process arguments (e.g., ["-y", "@package/name"]) */
  args: string[]
  /** Extra environment variables for the child process */
  env?: Record<string, string>
  /** Max time to wait for initial MCP connection (ms) */
  connectTimeoutMs: number
  /** Max time for a single tool call (ms) */
  callTimeoutMs: number
  /** Truncate tool output beyond this many characters */
  maxOutputChars: number
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/** Check if MCP integration is enabled (default: true) */
export function isMCPEnabled(): boolean {
  return process.env.MCP_ENABLED !== 'false'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sandbox tool names — used to distinguish sandbox vs MCP routing */
export const SANDBOX_TOOL_NAMES = new Set([
  'execute_code',
  'install_packages',
  'read_file',
  'write_file',
])

/** Max MCP servers that can be connected simultaneously per session */
export const MAX_CONNECTED_SERVERS = 5

/** Max time to spend on registry search + server connection per query (ms) */
export const DISCOVERY_TIMEOUT_MS = 20_000

/** MCP Registry API base URL */
export const MCP_REGISTRY_URL =
  'https://registry.modelcontextprotocol.io/v0.1'

/** Default connection timeout per server (ms) */
export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000

/** Default tool call timeout (ms) */
export const DEFAULT_CALL_TIMEOUT_MS = 30_000

/** Default max output characters per tool result */
export const DEFAULT_MAX_OUTPUT_CHARS = 12_000

/** Max number of servers to connect per discovery round */
export const MAX_SERVERS_PER_DISCOVERY = 3

/**
 * Enable dynamic registry discovery (Phase 2).
 * Disabled by default — most registry npm packages have broken shebangs
 * and fail to spawn. Set MCP_DYNAMIC_DISCOVERY=true to re-enable.
 */
export function isDynamicDiscoveryEnabled(): boolean {
  return process.env.MCP_DYNAMIC_DISCOVERY === 'true'
}

// ---------------------------------------------------------------------------
// Verified working MCP servers — pre-tested, guaranteed to work with npx
// These are connected on first use AND can be matched by keyword to user queries
// ---------------------------------------------------------------------------

export const VERIFIED_SERVERS: MCPServerConfig[] = [
  {
    id: 'verified/time',
    displayName: 'Time & Timezone',
    command: 'npx',
    args: ['-y', '@katomato65/time-mcp'],
    connectTimeoutMs: 15_000,
    callTimeoutMs: 5_000,
    maxOutputChars: 2_000,
  },
  {
    id: 'verified/search',
    displayName: 'DuckDuckGo Search',
    command: 'npx',
    args: ['-y', 'duckduckgo-mcp-server'],
    connectTimeoutMs: 15_000,
    callTimeoutMs: 15_000,
    maxOutputChars: 8_000,
  },
]

/**
 * Keywords that map to verified servers.
 * If a user query contains any of these keywords, the corresponding
 * verified server is connected (if not already connected).
 */
export const VERIFIED_SERVER_KEYWORDS: Record<string, string[]> = {
  'verified/time': [
    'time', 'timezone', 'clock', 'date', 'hour',
    'est', 'pst', 'utc', 'gmt', 'cst', 'mst', 'ist', 'bst', 'jst', 'cet',
  ],
  'verified/search': [
    'search', 'find', 'lookup', 'google', 'news', 'latest', 'current', 'recent', 'today',
    'weather', 'forecast', 'temperature', 'stock', 'price', 'score', 'result',
    'who is', 'what is', 'where is', 'how to', 'define', 'meaning',
    'wiki', 'wikipedia', 'article', 'headline',
  ],
}
