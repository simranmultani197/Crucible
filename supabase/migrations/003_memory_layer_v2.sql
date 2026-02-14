-- Memory layer v2: conversation summaries + reusable user facts

CREATE TABLE IF NOT EXISTS public.conversation_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  key_topics TEXT[] NOT NULL DEFAULT '{}',
  source_message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conv_created
  ON public.conversation_summaries(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.memory_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  fact_type TEXT NOT NULL DEFAULT 'context'
    CHECK (fact_type IN ('preference', 'profile', 'goal', 'constraint', 'context')),
  content TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_facts_user_updated
  ON public.memory_facts(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_facts_conv_updated
  ON public.memory_facts(conversation_id, updated_at DESC);

ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own conversation summaries"
  ON public.conversation_summaries;
CREATE POLICY "Users can CRUD own conversation summaries"
  ON public.conversation_summaries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can CRUD own memory facts"
  ON public.memory_facts;
CREATE POLICY "Users can CRUD own memory facts"
  ON public.memory_facts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
