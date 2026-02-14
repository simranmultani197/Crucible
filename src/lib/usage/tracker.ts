import { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_LIMITS } from './constants'

export async function checkRateLimit(
  userId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, daily_sessions_used, daily_sessions_reset_at')
    .eq('id', userId)
    .single()

  if (!profile) return false

  const plan = profile.plan as keyof typeof PLAN_LIMITS
  const limits = PLAN_LIMITS[plan]

  // Reset daily counter if needed
  const resetAt = new Date(profile.daily_sessions_reset_at)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (resetAt < today) {
    await supabase
      .from('profiles')
      .update({
        daily_sessions_used: 0,
        daily_sessions_reset_at: new Date().toISOString(),
      })
      .eq('id', userId)
    return true
  }

  return profile.daily_sessions_used < limits.dailySessions
}

export async function checkSandboxAccess(
  userId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single()

  if (!profile) return false

  const plan = profile.plan as keyof typeof PLAN_LIMITS
  return PLAN_LIMITS[plan].sandboxEnabled
}

export async function trackUsage(
  userId: string,
  supabase: SupabaseClient,
  usage: {
    eventType: string
    tokensIn: number
    tokensOut: number
    sandboxDurationMs?: number
    model: string
  }
): Promise<void> {
  // Log usage event
  await supabase.from('usage_logs').insert({
    user_id: userId,
    event_type: usage.eventType,
    tokens_in: usage.tokensIn,
    tokens_out: usage.tokensOut,
    sandbox_duration_ms: usage.sandboxDurationMs || 0,
    model: usage.model,
    cost_estimate_usd: estimateCost(usage),
  })

  // Increment session counter for sandbox usage
  if (usage.eventType === 'sandbox') {
    await supabase.rpc('increment_daily_sessions', { user_id_param: userId })
  }

  // Update monthly totals
  const { data: profile } = await supabase
    .from('profiles')
    .select('monthly_tokens_used, monthly_sandbox_seconds_used')
    .eq('id', userId)
    .single()

  if (profile) {
    await supabase
      .from('profiles')
      .update({
        monthly_tokens_used:
          (profile.monthly_tokens_used || 0) + usage.tokensIn + usage.tokensOut,
        monthly_sandbox_seconds_used:
          (profile.monthly_sandbox_seconds_used || 0) +
          Math.ceil((usage.sandboxDurationMs || 0) / 1000),
      })
      .eq('id', userId)
  }
}

function estimateCost(usage: {
  tokensIn: number
  tokensOut: number
  model: string
}): number {
  const rates: Record<string, { input: number; output: number }> = {
    'haiku-4.5': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
    'sonnet-4.5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  }
  const rate = rates[usage.model] || rates['haiku-4.5']
  return usage.tokensIn * rate.input + usage.tokensOut * rate.output
}
