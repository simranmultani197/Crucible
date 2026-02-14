export interface ExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  output: string
  files: Array<{
    name: string
    path: string
    size: number
  }>
  executionTimeMs: number
  error?: string
}

export interface SandboxStatus {
  active: boolean
  createdAt?: number
  userId?: string
  timeRemainingMs?: number
}
