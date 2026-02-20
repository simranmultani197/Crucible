import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { probeLocalMicroVM } from '@/lib/sandbox/probe'

// GET: Probe local microVM wrapper readiness
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fresh = req.nextUrl.searchParams.get('fresh') === '1'
  const result = await probeLocalMicroVM({ fresh })
  return NextResponse.json(result)
}
