import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

// Cache clients to avoid recreating on every request
const clientCache = new Map<string, { client: Anthropic; expiresAt: number }>()

export async function getAnthropicClient(
  userId: string,
  supabase: SupabaseClient
): Promise<Anthropic> {
  // Check cache first
  const cached = clientCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.client
  }

  // Fetch user's API key preference
  const { data: profile } = await supabase
    .from('profiles')
    .select('anthropic_api_key')
    .eq('id', userId)
    .single()

  let apiKey: string

  if (profile?.anthropic_api_key) {
    // BYOK: Use user's own key
    apiKey = profile.anthropic_api_key
  } else {
    // Use platform key
    apiKey = process.env.ANTHROPIC_API_KEY!
  }

  const client = new Anthropic({ apiKey })

  // Cache for 5 minutes
  clientCache.set(userId, {
    client,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })

  return client
}
