// Server-Sent Events helper for streaming responses to the frontend

export function createSSEStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array>
  const disconnectController = new AbortController()

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      // Called when the browser disconnects (tab close, navigation, etc.)
      disconnectController.abort()
    },
  })

  return {
    stream,
    /** Signal that aborts when the client disconnects */
    signal: disconnectController.signal,
    // Send a typed event to the client
    send(event: string, data: unknown) {
      if (disconnectController.signal.aborted) return
      try {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      } catch {
        // Stream may be closed if client disconnected
      }
    },
    // Close the stream
    close() {
      try {
        controller.close()
      } catch {
        // Stream may already be closed
      }
    },
  }
}
