import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function clampLimit(value: string | null): number {
  const parsed = Number(value || 20)
  if (!Number.isFinite(parsed)) return 20
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

// GET: Export run/audit history for current user.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = clampLimit(req.nextUrl.searchParams.get('limit'))

  const { data: runs, error: runsError } = await supabase
    .from('runs')
    .select(
      'id, conversation_id, status, intent_type, model_used, budget_limits, budget_consumed, error_message, started_at, completed_at, created_at, updated_at'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 })
  }

  const runIds = (runs || []).map((run) => run.id as string)
  if (runIds.length === 0) {
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      runs: [],
    })
  }

  const [stepsResult, toolCallsResult, artifactsResult] = await Promise.all([
    supabase
      .from('run_steps')
      .select(
        'id, run_id, step_key, status, input, output, error_message, started_at, completed_at, duration_ms'
      )
      .in('run_id', runIds)
      .order('started_at', { ascending: true }),
    supabase
      .from('tool_calls')
      .select(
        'id, run_id, run_step_id, tool_name, provider, status, input, output, duration_ms, cost_estimate_usd, created_at'
      )
      .in('run_id', runIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('run_artifacts')
      .select(
        'id, run_id, run_step_id, file_id, artifact_type, name, storage_path, mime_type, size_bytes, metadata, created_at'
      )
      .in('run_id', runIds)
      .order('created_at', { ascending: true }),
  ])

  const steps = stepsResult.data || []
  const toolCalls = toolCallsResult.data || []
  const artifacts = artifactsResult.data || []

  const shapedRuns = (runs || []).map((run) => ({
    ...run,
    steps: steps.filter((step) => step.run_id === run.id),
    toolCalls: toolCalls.filter((call) => call.run_id === run.id),
    artifacts: artifacts.filter((artifact) => artifact.run_id === run.id),
  }))

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    runs: shapedRuns,
  })
}
