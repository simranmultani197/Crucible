// Default limits for self-hosted open-source usage.
// All users get the same generous defaults — no tiers.
export const DEFAULT_LIMITS = {
  dailySessions: 100,
  sessionTimeoutMs: 15 * 60 * 1000, // 15 min max session
  maxTokensPerSession: 200_000,
  sandboxEnabled: true,
} as const
