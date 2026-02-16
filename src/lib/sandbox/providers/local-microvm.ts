import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SandboxCreateInput, SandboxFileEntry, SandboxRuntime } from '@/lib/sandbox/provider'

interface ProcessRunOptions {
  timeoutMs?: number
  stdin?: Buffer
}

interface ProcessRunResult {
  exitCode: number
  stdout: string
  stderr: string
}

interface CLICommand {
  binary: string
  preArgs: string[]
  display: string
}

function runProcess(
  binary: string,
  args: string[],
  options: ProcessRunOptions = {}
): Promise<ProcessRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let timeoutHandle: NodeJS.Timeout | null = null

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      reject(error)
    })

    if (options.stdin && options.stdin.length > 0) {
      child.stdin.write(options.stdin)
    }
    child.stdin.end()

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, options.timeoutMs)
    }

    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}\nProcess timed out` : stderr,
      })
    })
  })
}

function splitCommandSpec(spec: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const ch of spec) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }

    if (ch === '\\' && quote !== "'") {
      escaped = true
      continue
    }

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (escaped) {
    current += '\\'
  }

  if (quote) {
    throw new Error(`Invalid LOCAL_MICROVM_CLI: unmatched ${quote} quote`)
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

function resolveCLICommand(): CLICommand {
  const configured = process.env.LOCAL_MICROVM_CLI?.trim()
  if (configured) {
    const parts = splitCommandSpec(configured)
    if (parts.length === 0) {
      throw new Error('LOCAL_MICROVM_CLI is set but empty')
    }
    return {
      binary: parts[0],
      preArgs: parts.slice(1),
      display: configured,
    }
  }

  const bundledWrapper = join(process.cwd(), 'scripts', 'microvmctl.js')
  if (existsSync(bundledWrapper)) {
    return {
      binary: process.execPath,
      preArgs: [bundledWrapper],
      display: `${process.execPath} ${bundledWrapper}`,
    }
  }

  return {
    binary: 'microvmctl',
    preArgs: [],
    display: 'microvmctl',
  }
}

function runCLI(
  cli: CLICommand,
  args: string[],
  options: ProcessRunOptions = {}
): Promise<ProcessRunResult> {
  return runProcess(cli.binary, [...cli.preArgs, ...args], options)
}

function toBuffer(content: Blob | ArrayBuffer | Uint8Array | string): Promise<Buffer> {
  if (typeof content === 'string') {
    return Promise.resolve(Buffer.from(content, 'utf8'))
  }

  if (content instanceof Uint8Array) {
    return Promise.resolve(
      Buffer.from(content.buffer, content.byteOffset, content.byteLength)
    )
  }

  if (content instanceof ArrayBuffer) {
    return Promise.resolve(Buffer.from(content))
  }

  return content.arrayBuffer().then((buf) => Buffer.from(buf))
}

function parseListOutput(raw: string, basePath: string): SandboxFileEntry[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed) as unknown
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown[] }).entries)
      ? ((parsed as { entries: unknown[] }).entries)
      : []

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map((row) => {
      const name = String(row.name || row.filename || '')
      const entryPath = String(row.path || `${basePath.replace(/\/$/, '')}/${name}`)
      const type = row.type === 'dir' || row.type === 'directory' ? 'dir' : 'file'
      const size = typeof row.size === 'number' ? row.size : undefined
      return {
        name,
        path: entryPath,
        type,
        size,
      } satisfies SandboxFileEntry
    })
    .filter((row) => row.name.length > 0)
}

class LocalMicroVMSandboxRuntime implements SandboxRuntime {
  provider = 'local_microvm' as const

  constructor(private readonly cli: CLICommand, private readonly vmId: string) { }

  async runCommand(
    command: string,
    options: { timeoutMs: number }
  ): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }> {
    const result = await runCLI(
      this.cli,
      [
        'exec',
        '--id',
        this.vmId,
        '--timeout-ms',
        String(options.timeoutMs),
        '--',
        'sh',
        '-lc',
        command,
      ],
      { timeoutMs: options.timeoutMs + 2000 }
    )

    return result
  }

  async writeFile(
    path: string,
    content: Blob | ArrayBuffer | Uint8Array | string
  ): Promise<void> {
    const bytes = await toBuffer(content)
    const result = await runCLI(
      this.cli,
      ['write', '--id', this.vmId, '--path', path],
      { timeoutMs: 30000, stdin: bytes }
    )

    if (result.exitCode !== 0) {
      throw new Error(
        `local_microvm write failed (${result.exitCode}): ${result.stderr || result.stdout}`
      )
    }
  }

  async readFile(path: string, options: { format: 'blob' | 'text' }): Promise<Blob | string> {
    const result = await runCLI(
      this.cli,
      ['read', '--id', this.vmId, '--path', path, '--base64'],
      { timeoutMs: 30000 }
    )

    if (result.exitCode !== 0) {
      throw new Error(
        `local_microvm read failed (${result.exitCode}): ${result.stderr || result.stdout}`
      )
    }

    const base64 = result.stdout.trim()
    const buffer = base64 ? Buffer.from(base64, 'base64') : Buffer.alloc(0)
    if (options.format === 'text') {
      return buffer.toString('utf8')
    }
    return new Blob([buffer])
  }

  async listFiles(path: string): Promise<SandboxFileEntry[]> {
    const result = await runCLI(
      this.cli,
      ['list', '--id', this.vmId, '--path', path, '--json'],
      { timeoutMs: 15000 }
    )
    if (result.exitCode !== 0) {
      throw new Error(
        `local_microvm list failed (${result.exitCode}): ${result.stderr || result.stdout}`
      )
    }
    return parseListOutput(result.stdout, path)
  }

  async kill(): Promise<void> {
    await runCLI(this.cli, ['kill', '--id', this.vmId], { timeoutMs: 10000 })
  }
}

function formatLocalMicroVMError(cli: CLICommand, stderr: string): string {
  const detail = stderr.trim()
  const suffix = detail ? ` (${detail})` : ''
  return `local_microvm provider unavailable via "${cli.display}". Configure a local backend controller (for macOS use LOCAL_MICROVM_BACKEND_CLI="limactl shell crucible-worker -- microvmctl") or use SSH transport${suffix}`
}

export async function createLocalMicroVMSandbox(
  input: SandboxCreateInput
): Promise<SandboxRuntime> {
  const cli = resolveCLICommand()
  const vmId = `crucible-${input.userId.slice(0, 8)}-${randomUUID().slice(0, 8)}`

  try {
    const createResult = await runCLI(
      cli,
      ['create', '--id', vmId, '--ttl-ms', String(input.timeoutMs)],
      { timeoutMs: 20000 }
    )

    if (createResult.exitCode !== 0) {
      throw new Error(formatLocalMicroVMError(cli, createResult.stderr || createResult.stdout))
    }

    return new LocalMicroVMSandboxRuntime(cli, vmId)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      throw new Error(
        `local_microvm provider unavailable: command "${cli.display}" not found. Install/configure LOCAL_MICROVM_BACKEND_CLI (macOS: limactl shell crucible-worker -- microvmctl) or use SSH transport.`
      )
    }
    throw error
  }
}
