// ---------------------------------------------------------------------------
// Next.js Instrumentation Hook
// Runs once when the Next.js server starts. Used for graceful cleanup.
// ---------------------------------------------------------------------------

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { mcpManager } = await import('@/lib/mcp/manager')

    const cleanup = async () => {
      console.log('[Instrumentation] Shutting down MCP connections...')
      await mcpManager.shutdown()
      process.exit(0)
    }

    process.on('SIGTERM', cleanup)
    process.on('SIGINT', cleanup)
  }
}
