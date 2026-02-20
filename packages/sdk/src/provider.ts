import type { SandboxProvider } from './types/sandbox'

export interface SandboxFileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

export interface SandboxCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface SandboxCodeResult {
  logs: {
    stdout: string[]
    stderr: string[]
  }
  text: string
  error?: {
    traceback?: string
  } | null
  results?: Array<{
    png?: string
  }>
}

export interface SandboxRuntime {
  provider: SandboxProvider
  runCode?: (code: string, options: { timeoutMs: number }) => Promise<SandboxCodeResult>
  runCommand: (
    command: string,
    options: { timeoutMs: number }
  ) => Promise<SandboxCommandResult>
  writeFile: (
    path: string,
    content: Blob | ArrayBuffer | Uint8Array | string
  ) => Promise<void>
  readFile: (path: string, options: { format: 'blob' | 'text' }) => Promise<Blob | string>
  listFiles: (path: string) => Promise<SandboxFileEntry[]>
  kill: () => Promise<void>
}

export interface SandboxCreateInput {
  userId: string
  timeoutMs: number
}
