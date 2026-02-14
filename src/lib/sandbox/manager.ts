import { Sandbox } from '@e2b/code-interpreter'

interface SandboxSession {
  sandbox: Sandbox
  createdAt: number
  userId: string
}

// In-memory cache of active sandboxes (for MVP; use Redis in production)
const activeSandboxes = new Map<string, SandboxSession>()

const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes max

export async function getOrCreateSandbox(userId: string): Promise<Sandbox> {
  // Check for existing sandbox
  const existing = activeSandboxes.get(userId)
  if (existing && Date.now() - existing.createdAt < SANDBOX_TIMEOUT_MS) {
    return existing.sandbox
  }

  // Clean up old sandbox if exists
  if (existing) {
    try {
      await existing.sandbox.kill()
    } catch {}
    activeSandboxes.delete(userId)
  }

  // Create new sandbox
  const sandbox = await Sandbox.create({
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })

  activeSandboxes.set(userId, {
    sandbox,
    createdAt: Date.now(),
    userId,
  })

  return sandbox
}

export async function destroySandbox(userId: string): Promise<void> {
  const session = activeSandboxes.get(userId)
  if (session) {
    try {
      await session.sandbox.kill()
    } catch {}
    activeSandboxes.delete(userId)
  }
}

export async function installPackages(
  sandbox: Sandbox,
  packages: string[],
  language: string = 'python'
): Promise<{ success: boolean; output: string }> {
  if (packages.length === 0) return { success: true, output: '' }

  let command: string
  if (language === 'python') {
    command = `pip install ${packages.join(' ')} -q`
  } else if (language === 'javascript') {
    command = `npm install ${packages.join(' ')} --silent`
  } else {
    return { success: false, output: 'Unsupported language for package install' }
  }

  try {
    const result = await sandbox.commands.run(command, { timeoutMs: 60000 })
    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
    }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export function getSandboxStatus(userId: string) {
  const session = activeSandboxes.get(userId)
  if (!session) {
    return { active: false }
  }
  return {
    active: true,
    createdAt: session.createdAt,
    timeRemainingMs: SANDBOX_TIMEOUT_MS - (Date.now() - session.createdAt),
  }
}
