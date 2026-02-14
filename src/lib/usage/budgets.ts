import { PLAN_LIMITS, type PlanType } from './constants'
import type { RunBudget, RunUsage } from '@/lib/runs/ledger'

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'haiku-4.5': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  'sonnet-4.5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
}

export interface CodeRiskCheck {
  requiresApproval: boolean
  reasons: string[]
}

const RISK_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\brm\s+-rf\b/i, reason: 'Destructive shell deletion command detected.' },
  { regex: /\bshutil\.rmtree\b/, reason: 'Recursive directory deletion detected.' },
  { regex: /\bos\.remove\b/, reason: 'File deletion call detected.' },
  { regex: /\bsubprocess\.(run|Popen)\b/, reason: 'Subprocess invocation detected.' },
  { regex: /\beval\s*\(/, reason: 'Dynamic eval execution detected.' },
  { regex: /\bexec\s*\(/, reason: 'Dynamic exec execution detected.' },
]

export function buildRunBudget(plan: PlanType): RunBudget {
  const limits = PLAN_LIMITS[plan]

  return {
    maxTotalTokens: limits.maxTokensPerSession,
    maxOutputTokens: Math.min(1500, limits.maxTokensPerSession),
    maxSandboxMs: Math.min(30_000, limits.sessionTimeoutMs),
    maxCostUsd: plan === 'dev' ? 5 : plan === 'pro' ? 1 : 0.25,
  }
}

export function estimateUsageCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = MODEL_RATES[model] ?? MODEL_RATES['haiku-4.5']
  return inputTokens * rate.input + outputTokens * rate.output
}

export function isBudgetExceeded(usage: RunUsage, budget: RunBudget): boolean {
  return (
    usage.inputTokens + usage.outputTokens > budget.maxTotalTokens ||
    usage.sandboxMs > budget.maxSandboxMs ||
    usage.estimatedCostUsd > budget.maxCostUsd
  )
}

export function inspectCodeRisk(code: string): CodeRiskCheck {
  const reasons = RISK_PATTERNS
    .filter((p) => p.regex.test(code))
    .map((p) => p.reason)

  return {
    requiresApproval: reasons.length > 0,
    reasons,
  }
}
