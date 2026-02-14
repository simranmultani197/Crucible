-- Memory governance: settings, retention, soft-delete, and audit events

CREATE TABLE IF NOT EXISTS public.memory_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  auto_memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days INTEGER NOT NULL DEFAULT 180 CHECK (retention_days BETWEEN 7 AND 3650),
  allow_sensitive_memory BOOLEAN NOT NULL DEFAULT FALSE,
  export_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memory_facts'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.memory_facts ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memory_facts'
      AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE public.memory_facts ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memory_facts'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.memory_facts ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_summaries'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.conversation_summaries ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_summaries'
      AND column_name = 'is_deleted'
  ) THEN
    ALTER TABLE public.conversation_summaries ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_summaries'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.conversation_summaries ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memory_facts_expires_at
  ON public.memory_facts(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_memory_facts_active
  ON public.memory_facts(user_id, is_deleted, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_active
  ON public.conversation_summaries(user_id, is_deleted, created_at DESC);

CREATE TABLE IF NOT EXISTS public.memory_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_created
  ON public.memory_events(user_id, created_at DESC);

ALTER TABLE public.memory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own memory settings" ON public.memory_settings;
CREATE POLICY "Users can CRUD own memory settings"
  ON public.memory_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own memory events" ON public.memory_events;
CREATE POLICY "Users can view own memory events"
  ON public.memory_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own memory events" ON public.memory_events;
CREATE POLICY "Users can insert own memory events"
  ON public.memory_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
