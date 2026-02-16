export interface UserProfile {
  id: string
  email: string
  displayName?: string
  anthropicApiKey?: string | null
  preferredModel: 'haiku' | 'sonnet'
  dailySessionsUsed: number
  dailySessionsResetAt: string
  monthlyTokensUsed: number
  monthlySandboxSecondsUsed: number
  monthlyResetAt: string
  createdAt: string
  updatedAt: string
}

export interface BudgetSettings {
  maxAgentIterations?: number
  maxCostUsd?: number
  maxSandboxMs?: number
  maxTokensPerSession?: number
}

export interface UserSettings {
  preferred_model: string
  sandbox_provider: 'auto' | 'remote_e2b' | 'local_microvm'
  strict_no_fallback: boolean
  daily_sessions_used: number
  monthly_tokens_used: number
  monthly_sandbox_seconds_used: number
  anthropic_api_key: string | null
  budget_settings: BudgetSettings | null
}
