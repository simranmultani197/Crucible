export type PlanType = 'free' | 'pro' | 'dev'

export interface UserProfile {
  id: string
  email: string
  displayName?: string
  anthropicApiKey?: string | null
  preferredModel: 'haiku' | 'sonnet'
  plan: PlanType
  dailySessionsUsed: number
  dailySessionsResetAt: string
  monthlyTokensUsed: number
  monthlySandboxSecondsUsed: number
  monthlyResetAt: string
  createdAt: string
  updatedAt: string
}

export interface UserSettings {
  plan: PlanType
  preferred_model: string
  sandbox_provider: 'auto' | 'remote_e2b' | 'local_microvm'
  strict_no_fallback: boolean
  daily_sessions_used: number
  monthly_tokens_used: number
  monthly_sandbox_seconds_used: number
  anthropic_api_key: string | null
}
