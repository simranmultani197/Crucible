import type { SupabaseClient } from '@supabase/supabase-js'

export type RunStatus = 'running' | 'awaiting_approval' | 'completed' | 'failed'

export interface RunBudget {
  maxTotalTokens: number
  maxOutputTokens: number
  maxSandboxMs: number
  maxCostUsd: number
  maxAgentIterations: number
}

export interface RunUsage {
  inputTokens: number
  outputTokens: number
  sandboxMs: number
  estimatedCostUsd: number
}

interface CreateRunInput {
  userId: string
  conversationId: string
  modelUsed: string
  budget: RunBudget
}

interface CompleteRunInput {
  status: Exclude<RunStatus, 'running'>
  intentType?: string
  usage: RunUsage
  errorMessage?: string
}

interface ToolCallInput {
  runId: string | null
  runStepId?: string | null
  toolName: string
  provider?: string
  status: 'completed' | 'failed'
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  durationMs?: number
  costEstimateUsd?: number
}

interface ArtifactInput {
  runId: string | null
  runStepId?: string | null
  fileId?: string | null
  artifactType: 'file' | 'text' | 'code' | 'log'
  name: string
  storagePath?: string | null
  mimeType?: string | null
  sizeBytes?: number
  metadata?: Record<string, unknown>
}

export class RunLedger {
  constructor(private readonly supabase: SupabaseClient) {}

  async createRun(input: CreateRunInput): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('runs')
      .insert({
        user_id: input.userId,
        conversation_id: input.conversationId,
        status: 'running',
        model_used: input.modelUsed,
        budget_limits: input.budget,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create run ledger entry:', error)
      return null
    }

    return data.id as string
  }

  async startStep(
    runId: string | null,
    stepKey: string,
    input: Record<string, unknown> = {}
  ): Promise<string | null> {
    if (!runId) return null

    const { data, error } = await this.supabase
      .from('run_steps')
      .insert({
        run_id: runId,
        step_key: stepKey,
        status: 'running',
        input,
      })
      .select('id')
      .single()

    if (error) {
      console.error(`Failed to create run step (${stepKey}):`, error)
      return null
    }

    return data.id as string
  }

  async completeStep(
    stepId: string | null,
    output: Record<string, unknown> = {}
  ): Promise<void> {
    if (!stepId) return

    const { error } = await this.supabase
      .from('run_steps')
      .update({
        status: 'completed',
        output,
        completed_at: new Date().toISOString(),
      })
      .eq('id', stepId)

    if (error) {
      console.error(`Failed to complete step (${stepId}):`, error)
    }
  }

  async failStep(stepId: string | null, message: string): Promise<void> {
    if (!stepId) return

    const { error } = await this.supabase
      .from('run_steps')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', stepId)

    if (error) {
      console.error(`Failed to fail step (${stepId}):`, error)
    }
  }

  async recordToolCall(input: ToolCallInput): Promise<void> {
    if (!input.runId) return

    const { error } = await this.supabase.from('tool_calls').insert({
      run_id: input.runId,
      run_step_id: input.runStepId ?? null,
      tool_name: input.toolName,
      provider: input.provider,
      status: input.status,
      input: input.input ?? {},
      output: input.output ?? {},
      duration_ms: input.durationMs,
      cost_estimate_usd: input.costEstimateUsd ?? 0,
    })

    if (error) {
      console.error('Failed to record tool call:', error)
    }
  }

  async recordArtifact(input: ArtifactInput): Promise<void> {
    if (!input.runId) return

    const { error } = await this.supabase.from('run_artifacts').insert({
      run_id: input.runId,
      run_step_id: input.runStepId ?? null,
      file_id: input.fileId ?? null,
      artifact_type: input.artifactType,
      name: input.name,
      storage_path: input.storagePath ?? null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? 0,
      metadata: input.metadata ?? {},
    })

    if (error) {
      console.error('Failed to record artifact:', error)
    }
  }

  async completeRun(runId: string | null, input: CompleteRunInput): Promise<void> {
    if (!runId) return

    const { error } = await this.supabase
      .from('runs')
      .update({
        status: input.status,
        intent_type: input.intentType,
        budget_consumed: input.usage,
        error_message: input.errorMessage ?? null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)

    if (error) {
      console.error(`Failed to complete run (${runId}):`, error)
    }
  }
}
