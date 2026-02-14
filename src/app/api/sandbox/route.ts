import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSandboxStatus, destroySandbox } from '@/lib/sandbox/manager'

// GET: Get sandbox status for current user
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = getSandboxStatus(user.id)
  return NextResponse.json(status)
}

// DELETE: Kill active sandbox
export async function DELETE() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await destroySandbox(user.id)
  return NextResponse.json({ success: true })
}
