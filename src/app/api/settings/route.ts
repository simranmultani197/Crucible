import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import { resolveSandboxProviderPreference } from '@/lib/sandbox/manager'

// GET: Fetch user settings
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    data: profileWithStrict,
    error: profileStrictError,
  } = await supabase
    .from('profiles')
    .select(
      'preferred_model, sandbox_provider, strict_no_fallback, daily_sessions_used, monthly_tokens_used, monthly_sandbox_seconds_used, anthropic_api_key, budget_settings'
    )
    .eq('id', user.id)
    .single()

  let profile: Record<string, unknown> | null = profileWithStrict as
    | Record<string, unknown>
    | null
  if (profileStrictError) {
    const { data: fallbackProfile } = await supabase
      .from('profiles')
      .select(
        'preferred_model, sandbox_provider, daily_sessions_used, monthly_tokens_used, monthly_sandbox_seconds_used, anthropic_api_key'
      )
      .eq('id', user.id)
      .single()
    profile = fallbackProfile as Record<string, unknown> | null
  }

  const profileRecord = profile ?? {}
  const sandboxProvider = resolveSandboxProviderPreference(profileRecord.sandbox_provider as string | null)
  const strictNoFallback = profileRecord.strict_no_fallback === true
  const anthropicApiKeyRaw = profileRecord.anthropic_api_key
  const maskedAnthropicApiKey =
    typeof anthropicApiKeyRaw === 'string' && anthropicApiKeyRaw.length > 0
      ? '••••••' + anthropicApiKeyRaw.slice(-4)
      : null

  return NextResponse.json({
    ...profileRecord,
    sandbox_provider: sandboxProvider,
    strict_no_fallback: strictNoFallback,
    anthropic_api_key: maskedAnthropicApiKey,
  })
}

// PUT: Update settings (including BYOK key and budget controls)
export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const allowedFields = [
    'preferred_model',
    'anthropic_api_key',
    'sandbox_provider',
    'strict_no_fallback',
    'budget_settings',
  ]
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
    } catch {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 400 })
    }
  }

  // If removing API key, set to null
  if (body.anthropic_api_key === null || body.anthropic_api_key === '') {
    updates.anthropic_api_key = null
  }

  if (
    updates.sandbox_provider !== undefined &&
    updates.sandbox_provider !== 'auto' &&
    updates.sandbox_provider !== 'remote_e2b' &&
    updates.sandbox_provider !== 'local_microvm'
  ) {
    return NextResponse.json({ error: 'Invalid sandbox provider' }, { status: 400 })
  }

  if (
    updates.strict_no_fallback !== undefined &&
    typeof updates.strict_no_fallback !== 'boolean'
  ) {
    return NextResponse.json({ error: 'Invalid strict_no_fallback value' }, { status: 400 })
  }

  // Validate budget_settings if provided
  if (updates.budget_settings !== undefined && updates.budget_settings !== null) {
    const bs = updates.budget_settings as Record<string, unknown>
    if (typeof bs !== 'object') {
      return NextResponse.json({ error: 'Invalid budget_settings' }, { status: 400 })
    }
    // Clamp values to safe ranges
    const sanitized: Record<string, number> = {}
    if (bs.maxAgentIterations != null) {
      sanitized.maxAgentIterations = Math.max(1, Math.min(25, Number(bs.maxAgentIterations)))
    }
    if (bs.maxCostUsd != null) {
      sanitized.maxCostUsd = Math.max(0.5, Math.min(50, Number(bs.maxCostUsd)))
    }
    if (bs.maxSandboxMs != null) {
      sanitized.maxSandboxMs = Math.max(60_000, Math.min(30 * 60_000, Number(bs.maxSandboxMs)))
    }
    if (bs.maxTokensPerSession != null) {
      sanitized.maxTokensPerSession = Math.max(10_000, Math.min(500_000, Number(bs.maxTokensPerSession)))
    }
    updates.budget_settings = sanitized
  }

  let { error } = await supabase.from('profiles').update(updates).eq('id', user.id)

  if (
    error &&
    updates.strict_no_fallback !== undefined &&
    /strict_no_fallback/i.test(error.message)
  ) {
    const retryUpdates = { ...updates }
    delete retryUpdates.strict_no_fallback
    const retry = await supabase.from('profiles').update(retryUpdates).eq('id', user.id)
    error = retry.error
  }

  // Handle budget_settings column not existing yet
  if (
    error &&
    updates.budget_settings !== undefined &&
    /budget_settings/i.test(error.message)
  ) {
    const retryUpdates = { ...updates }
    delete retryUpdates.budget_settings
    const retry = await supabase.from('profiles').update(retryUpdates).eq('id', user.id)
    error = retry.error
  }

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
