import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createLocalMicroVMSandbox } from '@/lib/sandbox/providers/local-microvm'
import { createRemoteE2BSandbox } from '@/lib/sandbox/providers/e2b'
import type { SandboxRuntime } from '@/lib/sandbox/provider'
import { probeLocalMicroVM } from '@/lib/sandbox/probe'
import { WORKSPACE_LIMITS } from '@/lib/usage/constants'
import type {
  LocalMicroVMProbeResult,
  SandboxProvider,
  SandboxProviderPreference,
  SandboxStatus,
} from '@/types/sandbox'

const execFileAsync = promisify(execFile)

interface SandboxSession {
  sandbox: SandboxRuntime
  createdAt: number
  userId: string
  provider: SandboxProvider
  requestedProvider: SandboxProvider
  fallbackActive: boolean
}

// In-memory cache of active sandboxes (for MVP; use Redis in production)
const activeSandboxes = new Map<string, SandboxSession>()

const SANDBOX_TIMEOUT_MS =
  Number(process.env.SANDBOX_TIMEOUT_MS || 10 * 60 * 1000) || 10 * 60 * 1000

const LOCAL_MICROVM_FALLBACK_TO_REMOTE =
  process.env.LOCAL_MICROVM_FALLBACK_TO_REMOTE !== 'false'

// --- Automatic sandbox cleanup ---
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
let cleanupStarted = false

// ---------------------------------------------------------------------------
// Local workspace persistence (local_microvm only — no network calls)
// ---------------------------------------------------------------------------

interface WorkspaceManifest {
  files: Array<{ name: string; size: number }>
  savedAt: string
}

function getWorkspaceDir(userId: string): string {
  return join(homedir(), '.crucible', 'workspaces', userId.slice(0, 16))
}

export async function saveWorkspaceToLocal(
  userId: string,
  sandbox: SandboxRuntime
): Promise<void> {
  try {
    const entries = await sandbox.listFiles('/home/user/')
    const files = entries.filter(
      (e) =>
        e.type === 'file' &&
        !e.name.startsWith('_crucible_') &&
        !e.name.startsWith('script_')
    )

    if (files.length === 0) return

    const wsDir = getWorkspaceDir(userId)
    mkdirSync(wsDir, { recursive: true })

    const manifest: WorkspaceManifest = { files: [], savedAt: new Date().toISOString() }
    let totalSize = 0

    // Sort by name, take newest up to limit
    const candidates = files.slice(0, WORKSPACE_LIMITS.maxFiles)

    for (const file of candidates) {
      try {
        const content = await sandbox.readFile(file.path, { format: 'blob' })
        const blob = content instanceof Blob ? content : new Blob([content])
        const size = blob.size

        if (size > WORKSPACE_LIMITS.maxFileSizeBytes) continue
        if (totalSize + size > WORKSPACE_LIMITS.maxTotalSizeBytes) break

        const buf = Buffer.from(await blob.arrayBuffer())
        writeFileSync(join(wsDir, file.name), buf)
        manifest.files.push({ name: file.name, size })
        totalSize += size
      } catch {
        // Skip unreadable files
      }
    }

    writeFileSync(join(wsDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  } catch {
    // Workspace save is best-effort — never block sandbox destruction
  }
}

export async function restoreWorkspaceFromLocal(
  userId: string,
  sandbox: SandboxRuntime
): Promise<number> {
  const wsDir = getWorkspaceDir(userId)
  const manifestPath = join(wsDir, 'manifest.json')

  if (!existsSync(manifestPath)) return 0

  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const manifest: WorkspaceManifest = JSON.parse(raw)
    let restored = 0

    for (const file of manifest.files) {
      const localPath = join(wsDir, file.name)
      if (!existsSync(localPath)) continue

      try {
        const stat = statSync(localPath)
        if (stat.size > WORKSPACE_LIMITS.maxFileSizeBytes) continue

        const content = readFileSync(localPath)
        await sandbox.writeFile(`/home/user/${file.name}`, content)
        restored++
      } catch {
        // Skip unwritable files
      }
    }

    return restored
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------

function startSandboxCleanupTimer() {
  if (cleanupStarted) return
  cleanupStarted = true

  setInterval(async () => {
    const now = Date.now()

    // Sweep in-memory sessions
    const entries = Array.from(activeSandboxes.entries())
    for (const [userId, session] of entries) {
      if (now - session.createdAt >= SANDBOX_TIMEOUT_MS) {
        // Save workspace before destroying (local_microvm only)
        if (session.provider === 'local_microvm') {
          await saveWorkspaceToLocal(userId, session.sandbox)
        }
        try {
          await session.sandbox.kill()
        } catch { }
        activeSandboxes.delete(userId)
      }
    }

    // GC orphaned directories on disk (e.g. from server restarts)
    try {
      const wrapper = join(process.cwd(), 'scripts', 'microvmctl.js')
      await execFileAsync(process.execPath, [wrapper, 'gc'], { timeout: 15000 })
    } catch { }
  }, CLEANUP_INTERVAL_MS)
}

function isSandboxProvider(value: string | null | undefined): value is SandboxProvider {
  return value === 'remote_e2b' || value === 'local_microvm'
}

function isSandboxProviderPreference(
  value: string | null | undefined
): value is SandboxProviderPreference {
  return value === 'auto' || isSandboxProvider(value)
}

export function resolveSandboxProviderPreference(
  preferredProvider?: string | null
): SandboxProviderPreference {
  if (isSandboxProviderPreference(preferredProvider)) {
    return preferredProvider
  }

  if (isSandboxProviderPreference(process.env.SANDBOX_PROVIDER)) {
    return process.env.SANDBOX_PROVIDER
  }

  return 'auto'
}

async function chooseTargetProvider(
  preferredProvider?: string | null
): Promise<{
  preferred: SandboxProviderPreference
  target: SandboxProvider
  localProbe?: LocalMicroVMProbeResult
}> {
  const preferred = resolveSandboxProviderPreference(preferredProvider)

  if (preferred === 'remote_e2b') {
    return {
      preferred,
      target: 'remote_e2b',
    }
  }

  if (preferred === 'local_microvm') {
    const localProbe = await probeLocalMicroVM()
    return {
      preferred,
      target: 'local_microvm',
      localProbe,
    }
  }

  const localProbe = await probeLocalMicroVM()
  return {
    preferred,
    target: localProbe.ok ? 'local_microvm' : 'remote_e2b',
    localProbe,
  }
}

async function createSandboxRuntime(
  userId: string,
  provider: SandboxProvider
): Promise<SandboxRuntime> {
  const input = { userId, timeoutMs: SANDBOX_TIMEOUT_MS }
  if (provider === 'local_microvm') {
    return createLocalMicroVMSandbox(input)
  }
  return createRemoteE2BSandbox(input)
}

export async function getOrCreateSandbox(
  userId: string,
  preferredProvider?: string | null,
  options?: { strictNoFallback?: boolean }
): Promise<{
  sandbox: SandboxRuntime
  provider: SandboxProvider
}> {
  startSandboxCleanupTimer()
  const selected = await chooseTargetProvider(preferredProvider)
  const targetProvider = selected.target
  const strictNoFallback = options?.strictNoFallback === true
  const fallbackAllowed = LOCAL_MICROVM_FALLBACK_TO_REMOTE && !strictNoFallback

  // Check for existing sandbox
  const existing = activeSandboxes.get(userId)
  if (
    existing &&
    existing.provider === targetProvider &&
    Date.now() - existing.createdAt < SANDBOX_TIMEOUT_MS
  ) {
    return {
      sandbox: existing.sandbox,
      provider: existing.provider,
    }
  }

  // Clean up old sandbox if exists
  if (existing) {
    // Save workspace before destroying (local_microvm only)
    if (existing.provider === 'local_microvm') {
      await saveWorkspaceToLocal(userId, existing.sandbox)
    }
    try {
      await existing.sandbox.kill()
    } catch { }
    activeSandboxes.delete(userId)
  }

  let sandbox: SandboxRuntime
  let providerUsed = targetProvider
  let fallbackActive = false

  try {
    sandbox = await createSandboxRuntime(userId, targetProvider)
  } catch (error) {
    if (targetProvider === 'local_microvm' && fallbackAllowed) {
      sandbox = await createSandboxRuntime(userId, 'remote_e2b')
      providerUsed = 'remote_e2b'
      fallbackActive = true
    } else {
      throw error
    }
  }

  // Restore workspace files from local disk (local_microvm only)
  if (providerUsed === 'local_microvm') {
    await restoreWorkspaceFromLocal(userId, sandbox)
  }

  activeSandboxes.set(userId, {
    sandbox,
    createdAt: Date.now(),
    userId,
    provider: providerUsed,
    requestedProvider: targetProvider,
    fallbackActive,
  })

  return { sandbox, provider: providerUsed }
}

export async function destroySandbox(userId: string): Promise<void> {
  const session = activeSandboxes.get(userId)
  if (session) {
    // Save workspace before destroying (local_microvm only)
    if (session.provider === 'local_microvm') {
      await saveWorkspaceToLocal(userId, session.sandbox)
    }
    try {
      await session.sandbox.kill()
    } catch { }
    activeSandboxes.delete(userId)
  }
}

export async function installPackages(
  sandbox: SandboxRuntime,
  packages: string[],
  language: string = 'python'
): Promise<{ success: boolean; output: string }> {
  if (packages.length === 0) return { success: true, output: '' }

  let command: string
  if (language === 'python') {
    command = `pip3 install --break-system-packages ${packages.join(' ')} -q`
  } else if (language === 'javascript') {
    command = `npm install ${packages.join(' ')} --silent`
  } else {
    return { success: false, output: 'Unsupported language for package install' }
  }

  try {
    const result = await sandbox.runCommand(command, { timeoutMs: 60000 })
    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
    }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function getSandboxStatus(
  userId: string,
  preferredProvider?: string | null
): Promise<SandboxStatus> {
  const selected = await chooseTargetProvider(preferredProvider)
  const session = activeSandboxes.get(userId)

  if (!session) {
    return {
      active: false,
      preferredProvider: selected.preferred,
      resolvedProvider: selected.target,
      localMicrovm: selected.localProbe,
    }
  }

  return {
    active: true,
    provider: session.provider,
    preferredProvider: selected.preferred,
    resolvedProvider: session.requestedProvider,
    fallbackActive: session.fallbackActive,
    localMicrovm: selected.localProbe,
    createdAt: session.createdAt,
    timeRemainingMs: SANDBOX_TIMEOUT_MS - (Date.now() - session.createdAt),
  }
}
