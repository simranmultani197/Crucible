import type { Sandbox } from '@e2b/code-interpreter'
import type { PackageInstallResult } from '@/types/tools'

export async function installPackagesInSandbox(
  sandbox: Sandbox,
  packages: string[],
  language: string = 'python'
): Promise<PackageInstallResult> {
  if (packages.length === 0) {
    return { success: true, output: '' }
  }

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
