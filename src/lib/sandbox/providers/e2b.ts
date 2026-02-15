import { Sandbox } from '@e2b/code-interpreter'
import type {
  SandboxCodeResult,
  SandboxCreateInput,
  SandboxRuntime,
} from '@/lib/sandbox/provider'

class E2BSandboxRuntime implements SandboxRuntime {
  provider = 'remote_e2b' as const

  constructor(private readonly sandbox: Sandbox) {}

  async runCode(
    code: string,
    options: { timeoutMs: number }
  ): Promise<SandboxCodeResult> {
    const execution = await this.sandbox.runCode(code, {
      timeoutMs: options.timeoutMs,
    })

    return {
      logs: {
        stdout: execution.logs.stdout ?? [],
        stderr: execution.logs.stderr ?? [],
      },
      text: execution.text || '',
      error: execution.error
        ? {
            traceback: execution.error.traceback,
          }
        : null,
      results:
        execution.results?.map((result) => ({
          png: result.png,
        })) || [],
    }
  }

  async runCommand(
    command: string,
    options: { timeoutMs: number }
  ): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }> {
    const result = await this.sandbox.commands.run(command, {
      timeoutMs: options.timeoutMs,
    })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    }
  }

  async writeFile(
    path: string,
    content: Blob | ArrayBuffer | Uint8Array | string
  ): Promise<void> {
    if (typeof content === 'string') {
      await this.sandbox.files.write(path, content)
      return
    }

    let blob: Blob
    if (content instanceof Blob) {
      blob = content
    } else if (content instanceof ArrayBuffer) {
      blob = new Blob([content])
    } else {
      const byteCopy = new Uint8Array(content.byteLength)
      byteCopy.set(content)
      blob = new Blob([byteCopy.buffer])
    }

    await this.sandbox.files.write(path, blob)
  }

  async readFile(path: string, options: { format: 'blob' | 'text' }): Promise<Blob | string> {
    const blob = await this.sandbox.files.read(path, { format: 'blob' })
    if (options.format === 'text') {
      return blob.text()
    }
    return blob
  }

  async listFiles(path: string): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }>> {
    const entries = await this.sandbox.files.list(path)
    return entries.map((entry) => ({
      name: entry.name,
      path: `${path.replace(/\/$/, '')}/${entry.name}`,
      type: entry.type === 'dir' ? 'dir' : 'file',
      size:
        typeof (entry as { size?: unknown }).size === 'number'
          ? ((entry as { size?: number }).size)
          : undefined,
    }))
  }

  async kill(): Promise<void> {
    await this.sandbox.kill()
  }
}

export async function createRemoteE2BSandbox(
  input: SandboxCreateInput
): Promise<SandboxRuntime> {
  const sandbox = await Sandbox.create({
    timeoutMs: input.timeoutMs,
  })
  return new E2BSandboxRuntime(sandbox)
}
