import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Open-source: quota enforcement is disabled.
 * Users self-host and control costs via their own API keys.
 * Budget controls in Settings UI handle per-session limits instead.
 */
export async function enforceQuota(
  _userId: string,
  _supabase: SupabaseClient
): Promise<{ allowed: boolean; reason?: string }> {
  return { allowed: true }
}
