import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { probeLocalMicroVM } from '@/lib/sandbox/probe'

interface SetupStep {
  title: string
  description: string
  command?: string
}

function buildSteps(
  platform: string,
  arch: string | undefined,
  probeOk: boolean
): SetupStep[] {
  if (probeOk) {
    return [
      {
        title: 'Local microVM is ready',
        description:
          'Keep Auto mode enabled for smooth fallback behavior, or switch to Local MicroVM for strict local execution.',
      },
      {
        title: 'Validate execution path',
        description:
          'Run a sandbox task and verify provider metadata in /api/sandbox and tool_calls logs.',
      },
    ]
  }

  if (platform === 'linux') {
    return [
      {
        title: 'Install Linux worker runtime',
        description:
          'Install your microVM backend command and worker service on this Linux host.',
        command: 'bash scripts/linux/install-worker.sh',
      },
      {
        title: 'Probe readiness',
        description: 'Verify the local worker is discoverable by Forge.',
        command: 'npm run microvm:probe',
      },
    ]
  }

  if (platform === 'darwin' && arch === 'arm64') {
    return [
      {
        title: 'Provision host-local worker VM (recommended)',
        description:
          'Install and bootstrap a local Linux worker VM on this Mac (no external SSH host required).',
        command: 'bash scripts/macos/install-krunvm-worker.sh',
      },
      {
        title: 'Set local backend command',
        description:
          'Use LOCAL_MICROVM_TRANSPORT=local and LOCAL_MICROVM_BACKEND_CLI="limactl shell forge-worker -- microvmctl".',
      },
      {
        title: 'Probe readiness',
        description: 'Run probe and re-test in Settings.',
        command: 'npm run microvm:probe',
      },
      {
        title: 'Optional fallback path',
        description:
          'If local worker setup is blocked, switch to SSH Linux worker (LOCAL_MICROVM_TRANSPORT=ssh) or remote_e2b.',
      },
    ]
  }

  if (platform === 'win32') {
    return [
      {
        title: 'Enable Hyper-V worker path',
        description:
          'Install or configure a Hyper-V compatible backend command and point LOCAL_MICROVM_HYPERV_CLI to it.',
        command: 'powershell -ExecutionPolicy Bypass -File scripts/windows/install-hyperv-worker.ps1',
      },
      {
        title: 'Fallback path (recommended)',
        description:
          'Configure LOCAL_MICROVM_SSH_HOST to use a Linux worker if Hyper-V backend is unavailable.',
      },
      {
        title: 'Probe readiness',
        description: 'Run probe and confirm transport/provider status.',
        command: 'npm run microvm:probe',
      },
    ]
  }

  return [
    {
      title: 'Configure SSH Linux worker',
      description:
        'Set LOCAL_MICROVM_SSH_HOST, LOCAL_MICROVM_SSH_USER, LOCAL_MICROVM_SSH_KEY_PATH, and LOCAL_MICROVM_REMOTE_CLI.',
    },
    {
      title: 'Probe readiness',
      description: 'Run probe and re-test from Settings.',
      command: 'npm run microvm:probe',
    },
  ]
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fresh = req.nextUrl.searchParams.get('fresh') === '1'
  const probe = await probeLocalMicroVM({ fresh })
  const platform = probe.details?.platform || process.platform
  const arch = probe.details?.arch
  const steps = buildSteps(platform, arch, probe.ok)

  return NextResponse.json({
    recommendedProvider: 'auto',
    platform,
    arch,
    probe,
    steps,
  })
}
