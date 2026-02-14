import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MemoryManager } from '@/lib/memory/manager'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Number(req.nextUrl.searchParams.get('limit') || '50')
  const memoryManager = new MemoryManager(supabase)
  const summaries = await memoryManager.listSummaries(user.id, limit)
  return NextResponse.json(summaries)
}
