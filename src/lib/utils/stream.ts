// Server-Sent Events helper for streaming responses to the frontend

export function createSSEStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array>

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })

  return {
    stream,
    // Send a typed event to the client
    send(event: string, data: unknown) {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      controller.enqueue(encoder.encode(message))
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
