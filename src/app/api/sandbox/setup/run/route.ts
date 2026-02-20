import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { spawn } from 'node:child_process'
import { probeLocalMicroVM } from '@/lib/sandbox/probe'

export async function POST() {
    const supabase = await createServerSupabaseClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return new Response('Unauthorized', { status: 401 })
    }

    // Determine which script to run based on the platform and arch
    // If we already have a probe result, use that platform, else process.platform
    const probe = await probeLocalMicroVM()
    const platform = probe.details?.platform || process.platform
    const arch = probe.details?.arch || process.arch

    let command = ''
    let args: string[] = []

    if (platform === 'linux') {
        command = 'bash'
        args = ['scripts/linux/install-worker.sh']
    } else if (platform === 'darwin' && arch === 'arm64') {
        command = 'bash'
        args = ['scripts/macos/install-krunvm-worker.sh']
    } else if (platform === 'win32') {
        command = 'powershell'
        args = ['-ExecutionPolicy', 'Bypass', '-File', 'scripts/windows/install-hyperv-worker.ps1']
    } else {
        return new Response('No automated setup available for your platform.', { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        start(controller) {
            const child = spawn(command, args, {
                env: process.env,
                stdio: ['ignore', 'pipe', 'pipe']
            })

            child.stdout.on('data', (chunk) => {
                controller.enqueue(encoder.encode(chunk.toString()))
            })

            child.stderr.on('data', (chunk) => {
                controller.enqueue(encoder.encode(chunk.toString()))
            })

            child.on('error', (err) => {
                controller.enqueue(encoder.encode(`\nError: ${err.message}\n`))
                controller.close()
            })

            child.on('close', (code) => {
                controller.enqueue(encoder.encode(`\n\nProcess exited with code ${code}\n`))
                controller.close()
            })
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Content-Type-Options': 'nosniff',
        }
    })
}
