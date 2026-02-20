import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { spawn } from 'node:child_process'

const IDLE_SECONDS = Number(process.env.LOCAL_MICROVM_AUTO_STOP_IDLE_SECONDS || 90)
const INSTANCE_NAME = process.env.LOCAL_MICROVM_LIMA_INSTANCE || 'crucible-worker'

let idleTimer: ReturnType<typeof setTimeout> | null = null

function scheduleVmStop() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    const proc = spawn('limactl', ['stop', INSTANCE_NAME], {
      stdio: 'ignore',
      detached: true,
    })
    proc.unref()
  }, IDLE_SECONDS * 1000)
}

export async function POST() {
  const enabled = process.env.LOCAL_MICROVM_AUTO_STOP_ON_IDLE === '1' || 
                  process.env.LOCAL_MICROVM_AUTO_STOP_ON_IDLE === 'true'
  if (!enabled) {
    return NextResponse.json({ ok: true, autoStop: false })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  scheduleVmStop()
  return NextResponse.json({ ok: true, autoStop: true })
}
