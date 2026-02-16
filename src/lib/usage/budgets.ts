import { PLAN_LIMITS, type PlanType } from './constants'
import type { RunBudget, RunUsage } from '@/lib/runs/ledger'

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'haiku-4.5': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  'sonnet-4': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  // Legacy alias kept for backward compatibility
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

function readPositiveNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function getBudgetOverride(key: string, plan: PlanType): number | undefined {
  const planSpecific = readPositiveNumber(
    process.env[`RUN_BUDGET_${key}_${plan.toUpperCase()}`]
  )
  if (planSpecific !== undefined) return planSpecific
  return readPositiveNumber(process.env[`RUN_BUDGET_${key}`])
}

export function buildRunBudget(plan: PlanType): RunBudget {
  const limits = PLAN_LIMITS[plan]

  const defaults = {
    maxTotalTokens: limits.maxTokensPerSession,
    maxOutputTokens: Math.min(plan === 'dev' ? 8192 : 6144, limits.maxTokensPerSession),
    maxSandboxMs: Math.min(
      plan === 'dev' ? 8 * 60_000 : plan === 'pro' ? 5 * 60_000 : 2 * 60_000,
      limits.sessionTimeoutMs
    ),
    maxCostUsd: plan === 'dev' ? 15 : plan === 'pro' ? 3 : 0.5,
    maxAgentIterations: plan === 'dev' ? 16 : plan === 'pro' ? 10 : 4,
  }

  const maxTotalTokens = getBudgetOverride('MAX_TOTAL_TOKENS', plan) ?? defaults.maxTotalTokens
  const maxOutputTokens =
    Math.floor(getBudgetOverride('MAX_OUTPUT_TOKENS', plan) ?? defaults.maxOutputTokens)
  const maxSandboxMs =
    Math.floor(getBudgetOverride('MAX_SANDBOX_MS', plan) ?? defaults.maxSandboxMs)
  const maxCostUsd = getBudgetOverride('MAX_COST_USD', plan) ?? defaults.maxCostUsd
  const maxAgentIterations = Math.max(
    1,
    Math.floor(getBudgetOverride('MAX_AGENT_ITERATIONS', plan) ?? defaults.maxAgentIterations)
  )

  return {
    maxTotalTokens,
    maxOutputTokens: Math.min(maxOutputTokens, maxTotalTokens),
    maxSandboxMs,
    maxCostUsd,
    maxAgentIterations,
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
