// ---------------------------------------------------------------------------
// MCP Client Manager — Singleton managing dynamic MCP server connections
// ---------------------------------------------------------------------------

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  isMCPEnabled,
  isDynamicDiscoveryEnabled,
  MAX_CONNECTED_SERVERS,
  DISCOVERY_TIMEOUT_MS,
  VERIFIED_SERVERS,
  VERIFIED_SERVER_KEYWORDS,
  type MCPServerConfig,
} from './config'
import { discoverServers } from './registry'
import type { ToolExecutionResult } from '@/lib/llm/tools'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MCPToolDefinition {
  /** Original tool name from the MCP server */
  originalName: string
  /** Prefixed name: "{shortId}_{originalName}" */
  prefixedName: string
  /** Server ID this tool belongs to */
  serverId: string
  /** Tool description from the server */
  description: string
  /** JSON Schema for inputs (MCP format) */
  inputSchema: Record<string, unknown>
}

interface MCPServerConnection {
  config: MCPServerConfig
  client: Client
  transport: StdioClientTransport
  tools: MCPToolDefinition[]
  status: 'connecting' | 'connected' | 'failed'
  error?: string
  connectedAt: number
}

/** Anthropic tool_use format */
export interface AnthropicTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helper: derive short server ID for tool prefixing
// ---------------------------------------------------------------------------

function deriveShortId(registryName: string): string {
  // "io.github.AlexDeMichieli/weather" → "weather"
  // "io.github.dgahagan/weather-mcp" → "weather-mcp"
  const lastSegment = registryName.split('/').pop() || registryName
  // Clean to valid tool name characters (alphanumeric + underscore + hyphen)
  return lastSegment
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
}

// ---------------------------------------------------------------------------
// Singleton Manager
// ---------------------------------------------------------------------------

class MCPClientManager {
  private connections = new Map<string, MCPServerConnection>()
  private toolIndex = new Map<
    string,
    { serverId: string; originalName: string }
  >()
  private usedShortIds = new Map<string, number>() // shortId → count (for collision handling)

  // -----------------------------------------------------------------------
  // Dynamic discovery
  // -----------------------------------------------------------------------

  /**
   * Discover and connect to MCP servers relevant to the user's query.
   *
   * Strategy (hybrid):
   * 1. First, check if any VERIFIED (pre-tested) servers match the query keywords
   *    → These are guaranteed to work and connect fast
   * 2. Then, optionally search the MCP Registry for additional dynamic servers
   *    → These may or may not work (community quality varies)
   *
   * Already-connected servers are cached and reused.
   */
  async discoverForQuery(query: string): Promise<void> {
    if (!isMCPEnabled()) return

    // Don't exceed the connection limit
    if (this.getConnectedCount() >= MAX_CONNECTED_SERVERS) {
      console.log(`[MCP] Connection limit reached, skipping discovery`)
      return
    }

    const queryLower = query.toLowerCase()
    const toConnect: MCPServerConfig[] = []

    // ----- Phase 1: Match verified servers by keywords -----
    for (const server of VERIFIED_SERVERS) {
      if (this.connections.has(server.id)) continue // already connected

      const keywords = VERIFIED_SERVER_KEYWORDS[server.id] || []
      const matches = keywords.some((kw) => queryLower.includes(kw))
      if (matches) {
        toConnect.push(server)
      }
    }

    // ----- Phase 2: Dynamic registry discovery (best-effort) -----
    // Disabled by default — most registry npm packages have broken shebangs.
    // Set MCP_DYNAMIC_DISCOVERY=true in .env.local to re-enable.
    if (toConnect.length === 0 && isDynamicDiscoveryEnabled()) {
      try {
        const dynamicConfigs = await Promise.race([
          discoverServers(query),
          new Promise<MCPServerConfig[]>((resolve) =>
            setTimeout(() => {
              console.warn('[MCP] Registry discovery timeout')
              resolve([])
            }, DISCOVERY_TIMEOUT_MS)
          ),
        ])

        for (const config of dynamicConfigs) {
          if (!this.connections.has(config.id)) {
            toConnect.push(config)
          }
        }
      } catch (error) {
        console.warn('[MCP] Registry discovery failed:', error)
      }
    }

    if (toConnect.length === 0) return

    // Respect the connection cap
    const slotsAvailable = MAX_CONNECTED_SERVERS - this.getConnectedCount()
    const batch = toConnect.slice(0, slotsAvailable)

    // Connect to servers in parallel
    const connectPromises = batch.map((config) =>
      this._connectServer(config)
    )
    await Promise.allSettled(connectPromises)

    // Rebuild tool index after new connections
    this._rebuildToolIndex()
  }

  // -----------------------------------------------------------------------
  // Server connection
  // -----------------------------------------------------------------------

  private async _connectServer(config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: {
        ...(process.env as Record<string, string>),
        ...(config.env ?? {}),
      },
    })

    const client = new Client(
      { name: 'crucible', version: '1.0.0' },
      { capabilities: {} }
    )

    const conn: MCPServerConnection = {
      config,
      client,
      transport,
      tools: [],
      status: 'connecting',
      connectedAt: Date.now(),
    }
    this.connections.set(config.id, conn)

    try {
      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`MCP connect timeout: ${config.displayName}`)),
            config.connectTimeoutMs
          )
        ),
      ])

      // Discover tools
      const { tools } = await client.listTools()

      // Derive a short ID for tool prefixing
      const baseShortId = deriveShortId(config.id)
      const count = this.usedShortIds.get(baseShortId) || 0
      const shortId = count > 0 ? `${baseShortId}${count + 1}` : baseShortId
      this.usedShortIds.set(baseShortId, count + 1)

      conn.tools = tools.map((t) => ({
        originalName: t.name,
        prefixedName: `${shortId}_${t.name}`,
        serverId: config.id,
        description: t.description ?? '',
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
          type: 'object',
          properties: {},
        },
      }))
      conn.status = 'connected'
      console.log(
        `[MCP] Connected to ${config.displayName}: ${conn.tools.length} tools discovered (${conn.tools.map((t) => t.prefixedName).join(', ')})`
      )
    } catch (error) {
      conn.status = 'failed'
      conn.error = String(error)
      console.warn(
        `[MCP] Failed to connect to ${config.displayName}:`,
        error
      )
      // Clean up failed connection
      try {
        await transport.close()
      } catch {
        // ignore
      }
    }
  }

  // -----------------------------------------------------------------------
  // Tool index management
  // -----------------------------------------------------------------------

  private _rebuildToolIndex(): void {
    this.toolIndex.clear()
    for (const conn of Array.from(this.connections.values())) {
      if (conn.status !== 'connected') continue
      for (const tool of conn.tools) {
        this.toolIndex.set(tool.prefixedName, {
          serverId: conn.config.id,
          originalName: tool.originalName,
        })
      }
    }
  }

  // -----------------------------------------------------------------------
  // Tool access
  // -----------------------------------------------------------------------

  /**
   * Returns all discovered MCP tools in Anthropic tool_use format.
   * Returns empty array if MCP is disabled or no servers are connected.
   */
  getAnthropicTools(): AnthropicTool[] {
    if (!isMCPEnabled()) return []

    const tools: AnthropicTool[] = []
    for (const conn of Array.from(this.connections.values())) {
      if (conn.status !== 'connected') continue
      for (const tool of conn.tools) {
        tools.push({
          name: tool.prefixedName,
          description: `[MCP: ${conn.config.displayName}] ${tool.description}`,
          input_schema: tool.inputSchema,
        })
      }
    }
    return tools
  }

  /**
   * Check if a tool name belongs to an MCP server.
   */
  isMCPTool(toolName: string): boolean {
    return this.toolIndex.has(toolName)
  }

  /**
   * Execute an MCP tool call. Routes to the correct server.
   */
  async callTool(
    prefixedToolName: string,
    toolInput: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const routing = this.toolIndex.get(prefixedToolName)
    if (!routing) {
      return {
        success: false,
        output: `Unknown MCP tool: ${prefixedToolName}`,
      }
    }

    const conn = this.connections.get(routing.serverId)
    if (!conn || conn.status !== 'connected') {
      return {
        success: false,
        output: `MCP server "${conn?.config.displayName ?? routing.serverId}" is not connected.`,
      }
    }

    const startTime = Date.now()
    try {
      const result = await Promise.race([
        conn.client.callTool({
          name: routing.originalName,
          arguments: toolInput,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('MCP tool call timeout')),
            conn.config.callTimeoutMs
          )
        ),
      ])

      // Extract text content from MCP result
      let output = ''
      if (result.content && Array.isArray(result.content)) {
        output = result.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text?: string }) => c.text ?? '')
          .join('\n')
      }

      // Truncate if needed
      if (output.length > conn.config.maxOutputChars) {
        output =
          output.slice(0, conn.config.maxOutputChars) +
          `\n...[truncated — output exceeded ${conn.config.maxOutputChars} chars]`
      }

      // Sanitize: strip control characters except newlines/tabs
      output = output.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

      const isError = result.isError === true

      return {
        success: !isError,
        output:
          output ||
          (isError
            ? 'MCP tool returned an error with no details.'
            : '(no output)'),
        executionTimeMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        output: `MCP tool call failed: ${String(error)}`,
        executionTimeMs: Date.now() - startTime,
      }
    }
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /**
   * Returns connection status for all servers.
   */
  getStatus(): Array<{
    id: string
    displayName: string
    status: string
    toolCount: number
    error?: string
  }> {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.config.id,
      displayName: conn.config.displayName,
      status: conn.status,
      toolCount: conn.tools.length,
      error: conn.error,
    }))
  }

  private getConnectedCount(): number {
    let count = 0
    for (const conn of Array.from(this.connections.values())) {
      if (conn.status === 'connected') count++
    }
    return count
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Graceful shutdown: close all MCP client connections.
   */
  async shutdown(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(
      async (conn) => {
        try {
          await conn.transport.close()
        } catch {
          // ignore
        }
      }
    )
    await Promise.allSettled(closePromises)
    this.connections.clear()
    this.toolIndex.clear()
    this.usedShortIds.clear()
  }
}

// ---------------------------------------------------------------------------
// Export singleton instance
// ---------------------------------------------------------------------------

export const mcpManager = new MCPClientManager()
