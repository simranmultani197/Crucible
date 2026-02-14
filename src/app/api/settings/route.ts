import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET: Fetch user settings
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'plan, preferred_model, daily_sessions_used, monthly_tokens_used, monthly_sandbox_seconds_used, anthropic_api_key'
    )
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    ...profile,
    anthropic_api_key: profile?.anthropic_api_key
      ? '••••••' + profile.anthropic_api_key.slice(-4)
      : null,
  })
}

// PUT: Update settings (including BYOK key)
export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowedFields = ['preferred_model', 'anthropic_api_key']
  const updates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  // Validate API key if provided
  if (updates.anthropic_api_key) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const testClient = new Anthropic({
        apiKey: updates.anthropic_api_key as string,
      })
      await testClient.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      })

      // If key is valid, upgrade plan to 'dev'
      updates.plan = 'dev'
    } catch {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 400 })
    }
  }

  // If removing API key, downgrade plan
  if (body.anthropic_api_key === null || body.anthropic_api_key === '') {
    updates.anthropic_api_key = null
    updates.plan = 'free'
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
