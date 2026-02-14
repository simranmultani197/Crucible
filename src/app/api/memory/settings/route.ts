import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MemoryManager } from '@/lib/memory/manager'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const memoryManager = new MemoryManager(supabase)
  const settings = await memoryManager.getSettings(user.id)
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const memoryManager = new MemoryManager(supabase)
  const settings = await memoryManager.updateSettings(user.id, {
    autoMemoryEnabled:
      body.autoMemoryEnabled === undefined ? undefined : Boolean(body.autoMemoryEnabled),
    retentionDays:
      body.retentionDays === undefined ? undefined : Number(body.retentionDays),
    allowSensitiveMemory:
      body.allowSensitiveMemory === undefined
        ? undefined
        : Boolean(body.allowSensitiveMemory),
    exportAllowed:
      body.exportAllowed === undefined ? undefined : Boolean(body.exportAllowed),
  })

  return NextResponse.json(settings)
}
