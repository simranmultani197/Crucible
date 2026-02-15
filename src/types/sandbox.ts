export type SandboxProvider = 'remote_e2b' | 'local_microvm'
export type SandboxProviderPreference = SandboxProvider | 'auto'

export interface LocalMicroVMProbeDetails {
  transport?: string
  platform?: string
  arch?: string
  backend?: string
  backendFound?: boolean
  backendReady?: boolean | null
  backendProbeError?: string
  hypervBackendFound?: boolean
  sshHostConfigured?: boolean
  remoteCLI?: string
}

export interface LocalMicroVMProbeResult {
  ok: boolean
  details?: LocalMicroVMProbeDetails
  stderr?: string
}

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
  provider?: SandboxProvider
  preferredProvider?: SandboxProviderPreference | null
  resolvedProvider?: SandboxProvider
  fallbackActive?: boolean
  localMicrovm?: LocalMicroVMProbeResult
  createdAt?: number
  userId?: string
  timeRemainingMs?: number
}
