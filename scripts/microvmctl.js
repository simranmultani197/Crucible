#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

function printUsage() {
  process.stderr.write(
    [
      'Usage:',
      '  microvmctl <command> [args]',
      '',
      'Commands are forwarded to a backend microVM controller.',
      '',
      'Transport env vars:',
      '  LOCAL_MICROVM_TRANSPORT=local|ssh|hyperv',
      '  LOCAL_MICROVM_BACKEND_CLI="microvmctl"',
      '  LOCAL_MICROVM_HYPERV_CLI="hyperv-microvmctl"',
      '  LOCAL_MICROVM_SSH_HOST=<host>',
      '  LOCAL_MICROVM_SSH_USER=<user>',
      '  LOCAL_MICROVM_SSH_PORT=<port>',
      '  LOCAL_MICROVM_SSH_KEY_PATH=<path>',
      '  LOCAL_MICROVM_REMOTE_CLI="microvmctl"',
      '',
      'Examples:',
      '  node scripts/microvmctl.js create --id test --ttl-ms 60000',
      '  LOCAL_MICROVM_BACKEND_CLI="limactl shell crucible-worker -- microvmctl" node scripts/microvmctl.js probe',
      '  LOCAL_MICROVM_TRANSPORT=ssh LOCAL_MICROVM_SSH_HOST=10.0.0.2 node scripts/microvmctl.js list --id test --path /home/user --json',
      '',
    ].join('\n')
  )
}

function defaultBackendSpec() {
  if (process.platform === 'darwin') {
    return 'limactl shell crucible-worker -- microvmctl'
  }
  return 'microvmctl'
}

function splitCommandSpec(spec) {
  const tokens = []
  let current = ''
  let quote = null
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
    throw new Error(`Invalid command spec: unmatched ${quote} quote`)
  }
  if (current.length > 0) {
    tokens.push(current)
  }
  return tokens
}

function expandHome(inputPath) {
  if (!inputPath || inputPath[0] !== '~') {
    return inputPath
  }
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) return inputPath
  if (inputPath === '~') return home
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(home, inputPath.slice(2))
  }
  return inputPath
}

function resolveCommandSpec(envName, fallbackSpec) {
  const raw = (process.env[envName] || fallbackSpec || '').trim()
  const tokens = splitCommandSpec(raw)
  if (tokens.length === 0) {
    throw new Error(`Empty command spec for ${envName}`)
  }
  return {
    binary: expandHome(tokens[0]),
    args: tokens.slice(1),
    display: raw,
  }
}

function commandExists(command) {
  const hasPathSeparator = command.includes('/') || command.includes('\\')
  if (hasPathSeparator) {
    return fs.existsSync(expandHome(command))
  }

  const pathVar = process.env.PATH || ''
  const dirs = pathVar.split(path.delimiter).filter(Boolean)
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
      : ['']

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, process.platform === 'win32' ? command + ext : command)
      if (fs.existsSync(candidate)) {
        return true
      }
    }
  }

  return false
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`
}

function getLimaInstanceName(commandSpec) {
  const binaryName = path.basename(commandSpec.binary || '')
  if (binaryName !== 'limactl') return null
  if (!Array.isArray(commandSpec.args) || commandSpec.args.length < 2) return null
  if (commandSpec.args[0] !== 'shell') return null
  const instance = commandSpec.args[1]
  if (!instance || instance.startsWith('-')) return null
  return instance
}

function tryStartLimaInstance(commandSpec) {
  const instance = getLimaInstanceName(commandSpec)
  if (!instance) {
    return {
      attempted: false,
      ok: false,
      error: null,
    }
  }

  const startResult = spawnSync(commandSpec.binary, ['start', instance], {
    encoding: 'utf8',
    env: process.env,
    timeout: 90_000,
  })

  if (startResult.status === 0) {
    return {
      attempted: true,
      ok: true,
      error: null,
    }
  }

  const output = `${startResult.stderr || ''}\n${startResult.stdout || ''}`.trim()
  return {
    attempted: true,
    ok: false,
    error: output || `limactl start ${instance} failed`,
  }
}

function isLikelyLimaHandshakeError(text) {
  if (!text) return false
  return /kex_exchange_identification|connection reset by peer|broken pipe|bad port '0'|failed to connect|is stopped|no such file or directory/i.test(
    text
  )
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pickTransport(backendBinary, hypervBinary) {
  const explicit = (process.env.LOCAL_MICROVM_TRANSPORT || process.env.MICROVMCTL_TRANSPORT || '')
    .trim()
    .toLowerCase()
  if (explicit === 'local' || explicit === 'ssh' || explicit === 'hyperv') {
    return explicit
  }

  if (process.platform === 'win32') {
    if (commandExists(hypervBinary)) {
      return 'hyperv'
    }
    if ((process.env.LOCAL_MICROVM_SSH_HOST || '').trim()) {
      return 'ssh'
    }
    if (commandExists(backendBinary)) {
      return 'local'
    }
    return 'ssh'
  }

  if ((process.env.LOCAL_MICROVM_SSH_HOST || '').trim()) {
    return 'ssh'
  }

  if (commandExists(backendBinary)) {
    return 'local'
  }

  if (process.platform === 'darwin') {
    return 'local'
  }

  if (process.platform === 'linux') {
    return 'local'
  }

  return 'ssh'
}

function pipeAndWait(child) {
  process.stdin.pipe(child.stdin)
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)

  child.on('error', (error) => {
    process.stderr.write(`microvmctl wrapper error: ${error.message}\n`)
    process.exit(1)
  })

  child.on('close', (code) => {
    process.exit(code == null ? 1 : code)
  })
}

function runLocal(commandArgs, backendSpec) {
  const limaStart = tryStartLimaInstance(backendSpec)
  if (limaStart.attempted && !limaStart.ok) {
    process.stderr.write(
      `microvmctl wrapper warning: failed to auto-start Lima instance (${limaStart.error}). Continuing...\n`
    )
  }

  const child = spawn(
    backendSpec.binary,
    [...backendSpec.args, ...commandArgs],
    { stdio: ['pipe', 'pipe', 'pipe'], env: process.env }
  )
  pipeAndWait(child)
}

function runHyperV(commandArgs, hypervSpec) {
  const child = spawn(
    hypervSpec.binary,
    [...hypervSpec.args, ...commandArgs],
    { stdio: ['pipe', 'pipe', 'pipe'], env: process.env }
  )
  pipeAndWait(child)
}

function runSSH(commandArgs, remoteSpec) {
  const sshHost = (process.env.LOCAL_MICROVM_SSH_HOST || '').trim()
  if (!sshHost) {
    process.stderr.write(
      'LOCAL_MICROVM_SSH_HOST is required for ssh transport. Configure a Linux microVM host and retry.\n'
    )
    process.exit(1)
  }

  const sshUser = (process.env.LOCAL_MICROVM_SSH_USER || '').trim()
  const sshPort = (process.env.LOCAL_MICROVM_SSH_PORT || '').trim()
  const sshKeyPath = (process.env.LOCAL_MICROVM_SSH_KEY_PATH || '').trim()
  const strictHostKeyChecking =
    (process.env.LOCAL_MICROVM_SSH_STRICT_HOST_KEY_CHECKING || 'true').trim().toLowerCase() !==
    'false'

  const sshCommandSpec = resolveCommandSpec('LOCAL_MICROVM_SSH_CLI', 'ssh')
  const sshArgs = [...sshCommandSpec.args]

  if (sshPort) {
    sshArgs.push('-p', sshPort)
  }
  if (sshKeyPath) {
    sshArgs.push('-i', expandHome(sshKeyPath))
  }
  if (!strictHostKeyChecking) {
    sshArgs.push('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null')
  }

  sshArgs.push('-o', 'BatchMode=yes')
  sshArgs.push(sshUser ? `${sshUser}@${sshHost}` : sshHost)

  const remoteCommand = [...remoteSpec.args, ...commandArgs]
    .map((value) => shQuote(value))
    .join(' ')
  sshArgs.push(`${shQuote(remoteSpec.binary)} ${remoteCommand}`)

  const child = spawn(sshCommandSpec.binary, sshArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  })
  pipeAndWait(child)
}

function runProbe(transport, backendSpec, hypervSpec, remoteSpec) {
  let backendReady = null
  let backendProbeError = undefined
  const backendFound = commandExists(backendSpec.binary)
  let limaAutoStartAttempted = false

  if (transport === 'local' && backendFound) {
    const runBackendProbe = () =>
      spawnSync(backendSpec.binary, [...backendSpec.args, 'probe'], {
        encoding: 'utf8',
        env: process.env,
        timeout: 12_000,
      })

    let probeAttempt = runBackendProbe()
    backendReady = probeAttempt.status === 0

    if (!backendReady) {
      const initialError =
        (probeAttempt.stderr || '').trim() ||
        (probeAttempt.stdout || '').trim() ||
        'backend probe command failed'

      if (isLikelyLimaHandshakeError(initialError)) {
        const limaStart = tryStartLimaInstance(backendSpec)
        if (limaStart.attempted) {
          limaAutoStartAttempted = true
        }

        if (limaStart.ok) {
          // Lima VM needs time for SSH to become ready — especially on first cold start.
          // kex_exchange_identification/connection reset by peer = sshd not ready yet.
          const initialWait = 12_000 // 12s before first retry (VM boot + sshd init)
          process.stderr.write(
            `microvmctl: Lima instance started. Waiting ${initialWait / 1000}s for SSH to become ready...\n`
          )
          spawnSync('sleep', [String(initialWait / 1000)], { timeout: initialWait + 2000 })

          // Warmup: first SSH connection to a cold VM often fails; run a no-op to "wake" sshd
          const instance = getLimaInstanceName(backendSpec)
          if (instance) {
            spawnSync(backendSpec.binary, [...backendSpec.args.slice(0, 3), 'true'], {
              encoding: 'utf8',
              timeout: 15_000,
            })
            spawnSync('sleep', ['2'], { timeout: 3000 })
          }

          probeAttempt = runBackendProbe()
          backendReady = probeAttempt.status === 0

          if (!backendReady) {
            const retryDelays = [5000, 8000, 10000, 12000] // additional retries with longer waits
            for (const delay of retryDelays) {
              process.stderr.write(`microvmctl: Retrying probe in ${delay / 1000}s...\n`)
              spawnSync('sleep', [String(delay / 1000)], { timeout: delay + 2000 })
              probeAttempt = runBackendProbe()
              backendReady = probeAttempt.status === 0
              if (backendReady) break

              const retryError = (probeAttempt.stderr || '').trim()
              if (retryError && !isLikelyLimaHandshakeError(retryError)) break
            }
          }
        }
      }
    }

    if (!backendReady) {
      backendProbeError =
        (probeAttempt.stderr || '').trim() ||
        (probeAttempt.stdout || '').trim() ||
        'backend probe command failed'
    }
  }

  const payload = {
    transport,
    platform: process.platform,
    arch: process.arch,
    backend: backendSpec.display,
    backendFound,
    backendReady,
    backendProbeError,
    limaAutoStartAttempted,
    hypervBackendFound: commandExists(hypervSpec.binary),
    sshHostConfigured: Boolean((process.env.LOCAL_MICROVM_SSH_HOST || '').trim()),
    remoteCLI: remoteSpec.display,
  }

  process.stdout.write(`${JSON.stringify(payload)}\n`)
  if (transport === 'ssh' && !payload.sshHostConfigured) {
    process.stderr.write(
      'Probe failed: ssh transport selected but LOCAL_MICROVM_SSH_HOST is not set.\n'
    )
    process.exit(1)
  }
  if (transport === 'local' && !payload.backendFound) {
    process.stderr.write(
      `Probe failed: local backend command "${backendSpec.binary}" not found in PATH.\n`
    )
    process.exit(1)
  }
  if (transport === 'local' && payload.backendReady === false) {
    process.stderr.write(
      `Probe failed: local backend command is installed but not ready (${payload.backendProbeError}).\n`
    )
    process.exit(1)
  }
  if (transport === 'hyperv' && !payload.hypervBackendFound) {
    process.stderr.write(
      `Probe failed: hyperv backend command "${hypervSpec.binary}" not found in PATH.\n`
    )
    process.exit(1)
  }
}

function main() {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === 'help') {
    printUsage()
    process.exit(rawArgs.length === 0 ? 1 : 0)
  }

  const backendSpec = resolveCommandSpec('LOCAL_MICROVM_BACKEND_CLI', defaultBackendSpec())
  const hypervSpec = resolveCommandSpec('LOCAL_MICROVM_HYPERV_CLI', 'hyperv-microvmctl')
  const remoteSpec = resolveCommandSpec('LOCAL_MICROVM_REMOTE_CLI', 'microvmctl')
  const transport = pickTransport(backendSpec.binary, hypervSpec.binary)

  if (rawArgs[0] === 'probe') {
    runProbe(transport, backendSpec, hypervSpec, remoteSpec)
    process.exit(0)
  }

  if (transport === 'local') {
    runLocal(rawArgs, backendSpec)
    return
  }

  if (transport === 'ssh') {
    runSSH(rawArgs, remoteSpec)
    return
  }

  if (transport === 'hyperv') {
    runHyperV(rawArgs, hypervSpec)
    return
  }

  process.stderr.write(`Unsupported transport: ${transport}\n`)
  process.exit(1)
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `microvmctl wrapper fatal error: ${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exit(1)
}
