export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  intentType?: 'chat' | 'code_exec' | 'file_analysis'
  modelUsed?: string
  tokensIn?: number
  tokensOut?: number
  sandboxUsed?: boolean
  sandboxDurationMs?: number
  metadata?: {
    sandboxOutput?: string
    packagesInstalled?: string[]
    filesCreated?: { name: string; url: string; size: number }[]
    executionTimeMs?: number
    error?: string
    code?: string
    language?: string
    checkpoint?: {
      type: string
      reason: string
      details?: string[]
    }
    // Agent loop metadata
    agentIterations?: number
    thinkingSteps?: string[]
    toolCalls?: Array<{
      toolName: string
      success: boolean
      output?: string
      source?: 'sandbox' | 'mcp'
    }>
  }
  isStreaming?: boolean
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  userId: string
  createdAt: string
  updatedAt: string
}

export interface ChatRequest {
  message: string
  conversationId: string
  fileIds?: string[]
}

export type SSEEventType =
  | 'status'
  | 'text'
  | 'code'
  | 'output'
  | 'file'
  | 'checkpoint'
  | 'error'
  | 'done'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'mcp_status'

export interface SSEEvent {
  event: SSEEventType
  data: Record<string, unknown>
}
