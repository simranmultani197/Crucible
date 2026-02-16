import { DEFAULT_LIMITS } from './constants'
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

/** User-configurable budget overrides (stored in profiles.budget_settings JSON) */
export interface BudgetOverrides {
  maxAgentIterations?: number
  maxCostUsd?: number
  maxSandboxMs?: number
  maxTokensPerSession?: number
}

function readPositiveNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function getEnvOverride(key: string): number | undefined {
  return readPositiveNumber(process.env[`RUN_BUDGET_${key}`])
}

/**
 * Build a run budget using generous defaults.
 * Accepts optional user overrides from the Settings UI.
 * Env var overrides (RUN_BUDGET_*) take final precedence.
 */
export function buildRunBudget(overrides?: BudgetOverrides): RunBudget {
  const defaults = {
    maxTotalTokens: DEFAULT_LIMITS.maxTokensPerSession,
    maxOutputTokens: 8192,
    maxSandboxMs: 10 * 60_000, // 10 minutes
    maxCostUsd: 15,
    maxAgentIterations: 16,
  }

  // Layer 1: User overrides from Settings UI
  const withUserOverrides = {
    maxTotalTokens: overrides?.maxTokensPerSession ?? defaults.maxTotalTokens,
    maxOutputTokens: defaults.maxOutputTokens,
    maxSandboxMs: overrides?.maxSandboxMs ?? defaults.maxSandboxMs,
    maxCostUsd: overrides?.maxCostUsd ?? defaults.maxCostUsd,
    maxAgentIterations: overrides?.maxAgentIterations ?? defaults.maxAgentIterations,
  }

  // Layer 2: Env var overrides take final precedence
  const maxTotalTokens = getEnvOverride('MAX_TOTAL_TOKENS') ?? withUserOverrides.maxTotalTokens
  const maxOutputTokens = Math.floor(
    getEnvOverride('MAX_OUTPUT_TOKENS') ?? withUserOverrides.maxOutputTokens
  )
  const maxSandboxMs = Math.floor(
    getEnvOverride('MAX_SANDBOX_MS') ?? withUserOverrides.maxSandboxMs
  )
  const maxCostUsd = getEnvOverride('MAX_COST_USD') ?? withUserOverrides.maxCostUsd
  const maxAgentIterations = Math.max(
    1,
    Math.floor(getEnvOverride('MAX_AGENT_ITERATIONS') ?? withUserOverrides.maxAgentIterations)
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
