import { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_LIMITS } from './constants'

export async function enforceQuota(
  userId: string,
  supabase: SupabaseClient
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, monthly_tokens_used, monthly_sandbox_seconds_used, monthly_reset_at')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { allowed: false, reason: 'Profile not found' }
  }

  const plan = profile.plan as keyof typeof PLAN_LIMITS
  const limits = PLAN_LIMITS[plan]

  // Check monthly token budget
  if (profile.monthly_tokens_used >= limits.monthlyTokenBudget) {
    return {
      allowed: false,
      reason: 'Monthly token budget exceeded. Upgrade your plan or add your own API key.',
    }
  }

  return { allowed: true }
}
