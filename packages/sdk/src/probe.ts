import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LocalMicroVMProbeResult } from './types/sandbox'

const PROBE_CACHE_TTL_MS = 15_000
const PROBE_DEFAULT_TIMEOUT_MS = 120_000

let cachedProbe: { value: LocalMicroVMProbeResult; createdAt: number } | null = null

function parseProbeDetails(stdout: string): LocalMicroVMProbeResult['details'] {
  const firstLine = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'))

  if (!firstLine) return undefined

  try {
    const parsed = JSON.parse(firstLine) as Record<string, unknown>
    return {
      transport: typeof parsed.transport === 'string' ? parsed.transport : undefined,
      platform: typeof parsed.platform === 'string' ? parsed.platform : undefined,
      arch: typeof parsed.arch === 'string' ? parsed.arch : undefined,
      backend: typeof parsed.backend === 'string' ? parsed.backend : undefined,
      backendFound:
        typeof parsed.backendFound === 'boolean' ? parsed.backendFound : undefined,
      backendReady:
        typeof parsed.backendReady === 'boolean' || parsed.backendReady === null
          ? (parsed.backendReady as boolean | null)
          : undefined,
      backendProbeError:
        typeof parsed.backendProbeError === 'string'
          ? parsed.backendProbeError
          : undefined,
      limaAutoStartAttempted:
        typeof parsed.limaAutoStartAttempted === 'boolean'
          ? parsed.limaAutoStartAttempted
          : undefined,
      hypervBackendFound:
        typeof parsed.hypervBackendFound === 'boolean'
          ? parsed.hypervBackendFound
          : undefined,
      sshHostConfigured:
        typeof parsed.sshHostConfigured === 'boolean'
          ? parsed.sshHostConfigured
          : undefined,
      remoteCLI: typeof parsed.remoteCLI === 'string' ? parsed.remoteCLI : undefined,
    }
  } catch {
    return undefined
  }
}

export async function probeLocalMicroVM(
  options?: { fresh?: boolean; timeoutMs?: number }
): Promise<LocalMicroVMProbeResult> {
  const fresh = options?.fresh === true
  const timeoutMs = options?.timeoutMs ?? PROBE_DEFAULT_TIMEOUT_MS

  if (
    !fresh &&
    cachedProbe &&
    Date.now() - cachedProbe.createdAt < PROBE_CACHE_TTL_MS
  ) {
    return cachedProbe.value
  }

  const scriptPath = join(process.cwd(), 'scripts', 'microvmctl.js')
  if (!existsSync(scriptPath)) {
    const missingScriptResult: LocalMicroVMProbeResult = {
      ok: false,
      stderr: 'Missing scripts/microvmctl.js wrapper.',
    }
    cachedProbe = { value: missingScriptResult, createdAt: Date.now() }
    return missingScriptResult
  }

  const result = await new Promise<LocalMicroVMProbeResult>((resolve) => {
    const child = spawn(process.execPath, [scriptPath, 'probe'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timeoutHandle)
      resolve({
        ok: false,
        stderr: error.message,
      })
    })

    child.on('close', (code) => {
      clearTimeout(timeoutHandle)
      const parsedDetails = parseProbeDetails(stdout)
      resolve({
        ok: !timedOut && code === 0,
        details: parsedDetails,
        stderr: timedOut ? 'Probe timed out.' : stderr.trim() || undefined,
      })
    })
  })

  cachedProbe = { value: result, createdAt: Date.now() }
  return result
}
