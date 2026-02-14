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

export type SSEEventType = 'status' | 'text' | 'code' | 'output' | 'file' | 'error' | 'done'

export interface SSEEvent {
  event: SSEEventType
  data: Record<string, unknown>
}
