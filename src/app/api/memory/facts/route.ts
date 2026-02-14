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

  const limit = Number(req.nextUrl.searchParams.get('limit') || '100')
  const memoryManager = new MemoryManager(supabase)
  const facts = await memoryManager.listFacts(user.id, limit)
  return NextResponse.json(facts)
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
  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const memoryManager = new MemoryManager(supabase)
  const ok = await memoryManager.updateFact(user.id, body.id, {
    content: body.content,
    factType: body.factType,
    confidence: body.confidence,
  })

  if (!ok) {
    return NextResponse.json({ error: 'Unable to update fact' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const memoryManager = new MemoryManager(supabase)
  const scope = req.nextUrl.searchParams.get('scope')
  if (scope === 'all') {
    await memoryManager.clearAllMemory(user.id)
    return NextResponse.json({ success: true })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const ok = await memoryManager.deleteFact(user.id, id)
  if (!ok) {
    return NextResponse.json({ error: 'Unable to delete fact' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
