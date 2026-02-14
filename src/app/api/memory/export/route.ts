import { NextResponse } from 'next/server'
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
  if (!settings.exportAllowed) {
    return NextResponse.json(
      { error: 'Memory export is disabled for this account.' },
      { status: 403 }
    )
  }

  const payload = await memoryManager.exportMemory(user.id)
  return NextResponse.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="memory-export-${Date.now()}.json"`,
    },
  })
}
