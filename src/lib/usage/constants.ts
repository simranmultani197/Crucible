export const PLAN_LIMITS = {
  free: {
    dailySessions: 5,
    sessionTimeoutMs: 5 * 60 * 1000, // 5 min max session
    maxTokensPerSession: 8000,
    monthlyTokenBudget: 500000, // ~$0.50 worth of Haiku
    sandboxEnabled: false, // FREE = chat only, no sandbox
  },
  pro: {
    dailySessions: 30,
    sessionTimeoutMs: 15 * 60 * 1000,
    maxTokensPerSession: 15000,
    monthlyTokenBudget: 5000000,
    sandboxEnabled: true,
  },
  dev: {
    // BYOK tier
    dailySessions: 50,
    sessionTimeoutMs: 15 * 60 * 1000,
    maxTokensPerSession: 20000,
    monthlyTokenBudget: Infinity, // User pays own tokens
    sandboxEnabled: true,
  },
} as const

export type PlanType = keyof typeof PLAN_LIMITS
