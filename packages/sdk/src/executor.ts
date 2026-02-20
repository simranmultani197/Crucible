import { Buffer } from 'node:buffer'
import type { SandboxRuntime } from './provider'
import type { ExecutionResult } from './types/sandbox'

// File extensions to detect as output files
const OUTPUT_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
  'pdf', 'csv', 'json', 'html', 'txt', 'md',
  'xlsx', 'xml', 'zip',
])

/**
 * Snapshot the filenames in /home/user/ before execution
 * so we can diff after and detect newly created files.
 */
async function snapshotDirectory(sandbox: SandboxRuntime): Promise<Set<string>> {
  try {
    const entries = await sandbox.listFiles('/home/user/')
    return new Set(entries.map((e) => e.name))
  } catch {
    return new Set()
  }
}

/**
 * Detect new files created in /home/user/ during execution
 * by diffing a before/after directory snapshot.
 */
async function detectNewFiles(
  sandbox: SandboxRuntime,
  beforeSnapshot: Set<string>,
  excludeFilenames: string[]
): Promise<ExecutionResult['files']> {
  const files: ExecutionResult['files'] = []
  const excludeSet = new Set(excludeFilenames)

  try {
    const afterEntries = await sandbox.listFiles('/home/user/')
    for (const entry of afterEntries) {
      // Skip directories, existing files, and script files
      if (entry.type === 'dir') continue
      if (beforeSnapshot.has(entry.name)) continue
      if (excludeSet.has(entry.name)) continue

      // Only pick up known output file types
      const ext = entry.name.split('.').pop()?.toLowerCase() || ''
      if (!OUTPUT_EXTENSIONS.has(ext)) continue

      files.push({
        name: entry.name,
        path: `/home/user/${entry.name}`,
        size: 0, // actual size determined when read via blob
      })
    }
  } catch {
    // Silently fail — file detection is best-effort
  }

  return files
}

export async function executeCode(
  sandbox: SandboxRuntime,
  code: string,
  language: string = 'python',
  options?: { timeoutMs?: number }
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const timeoutMs = options?.timeoutMs ?? 30000

  try {
    // Snapshot directory before execution to detect new files later
    const beforeSnapshot = await snapshotDirectory(sandbox)

    if (language === 'python' && sandbox.runCode) {
      const execution = await sandbox.runCode(code, {
        timeoutMs,
      })

      const stdout = execution.logs.stdout.join('\n')
      const stderr = execution.logs.stderr.join('\n')

      // Detect files written to disk by the code (e.g. qrcode.save(), to_csv(), etc.)
      const diskFiles = await detectNewFiles(
        sandbox,
        beforeSnapshot,
        []
      )

      const files: ExecutionResult['files'] = []

      if (diskFiles.length > 0) {
        // Prefer disk-written files — they are the actual user-intended output
        files.push(...diskFiles)
      } else if (execution.results && execution.results.length > 0) {
        // Fallback: capture inline result PNGs (e.g. matplotlib display output)
        // Only used when the code didn't write any files to disk
        for (const result of execution.results) {
          if (result.png) {
            const filename = `output_${Date.now()}.png`
            const pngBytes = Buffer.from(result.png, 'base64')
            await sandbox.writeFile(`/home/user/${filename}`, pngBytes)
            files.push({
              name: filename,
              path: `/home/user/${filename}`,
              size: pngBytes.length,
            })
          }
        }
      }

      return {
        success: !execution.error,
        stdout,
        stderr,
        output: execution.text || stdout,
        files,
        executionTimeMs: Date.now() - startTime,
        error: execution.error ? execution.error.traceback : undefined,
      }
    } else {
      // JavaScript/python/bash via command
      const ext =
        language === 'javascript'
          ? 'js'
          : language === 'python'
            ? 'py'
            : 'sh'
      const scriptFilename = `script_${Date.now()}.${ext}`
      await sandbox.writeFile(`/home/user/${scriptFilename}`, code)

      const cmd =
        language === 'javascript'
          ? `node /home/user/${scriptFilename}`
          : language === 'python'
            ? `python3 /home/user/${scriptFilename}`
            : `bash /home/user/${scriptFilename}`

      const result = await sandbox.runCommand(cmd, { timeoutMs })

      // Detect files written to disk by JS/bash scripts
      const diskFiles = await detectNewFiles(
        sandbox,
        beforeSnapshot,
        [scriptFilename]
      )

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        output: result.stdout,
        files: diskFiles,
        executionTimeMs: Date.now() - startTime,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      }
    }
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: String(error),
      output: '',
      files: [],
      executionTimeMs: Date.now() - startTime,
      error: String(error),
    }
  }
}
