-- Run ledger for replayable and auditable agent execution

CREATE TABLE IF NOT EXISTS public.runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'awaiting_approval', 'completed', 'failed')),
  intent_type TEXT,
  model_used TEXT,
  budget_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_consumed JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_user_created ON public.runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_conversation_created ON public.runs(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_started ON public.run_steps(run_id, started_at ASC);

CREATE TABLE IF NOT EXISTS public.tool_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  run_step_id UUID REFERENCES public.run_steps(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  cost_estimate_usd DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_run_created ON public.tool_calls(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.run_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  run_step_id UUID REFERENCES public.run_steps(id) ON DELETE SET NULL,
  file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('file', 'text', 'code', 'log')),
  name TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_created ON public.run_artifacts(run_id, created_at DESC);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own runs" ON public.runs;
CREATE POLICY "Users can CRUD own runs" ON public.runs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can CRUD own run steps" ON public.run_steps;
CREATE POLICY "Users can CRUD own run steps" ON public.run_steps
  FOR ALL USING (
    run_id IN (SELECT id FROM public.runs WHERE user_id = auth.uid())
  )
  WITH CHECK (
    run_id IN (SELECT id FROM public.runs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD own tool calls" ON public.tool_calls;
CREATE POLICY "Users can CRUD own tool calls" ON public.tool_calls
  FOR ALL USING (
    run_id IN (SELECT id FROM public.runs WHERE user_id = auth.uid())
  )
  WITH CHECK (
    run_id IN (SELECT id FROM public.runs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD own run artifacts" ON public.run_artifacts;
CREATE POLICY "Users can CRUD own run artifacts" ON public.run_artifacts
  FOR ALL USING (
    run_id IN (SELECT id FROM public.runs WHERE user_id = auth.uid())
  )
  WITH CHECK (
    run_id IN (SELECT id FROM public.runs WHERE user_id = auth.uid())
  );
