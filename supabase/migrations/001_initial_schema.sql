-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  -- BYOK settings (encrypted at rest by Supabase)
  anthropic_api_key TEXT,  -- encrypted user's own API key
  preferred_model TEXT DEFAULT 'haiku',  -- 'haiku' or 'sonnet'
  -- Usage tracking
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'dev')),
  daily_sessions_used INTEGER DEFAULT 0,
  daily_sessions_reset_at TIMESTAMPTZ DEFAULT NOW(),
  monthly_tokens_used BIGINT DEFAULT 0,
  monthly_sandbox_seconds_used INTEGER DEFAULT 0,
  monthly_reset_at TIMESTAMPTZ DEFAULT NOW(),
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON public.conversations(user_id, updated_at DESC);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  -- Metadata
  intent_type TEXT,  -- 'chat', 'code_exec', 'file_analysis'
  model_used TEXT,   -- 'haiku-4.5', 'sonnet-4.5'
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  sandbox_used BOOLEAN DEFAULT FALSE,
  sandbox_duration_ms INTEGER DEFAULT 0,
  -- Tool/execution metadata
  metadata JSONB DEFAULT '{}',  -- stores: packages_installed, files_created, errors, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at ASC);

-- Files (uploaded or generated)
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,  -- Supabase Storage path
  direction TEXT NOT NULL CHECK (direction IN ('upload', 'download')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage logs (for analytics and billing)
CREATE TABLE public.usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'chat', 'sandbox_start', 'sandbox_end', 'token_usage'
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  sandbox_duration_ms INTEGER DEFAULT 0,
  model TEXT,
  cost_estimate_usd DECIMAL(10, 6) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_user_date ON public.usage_logs(user_id, created_at DESC);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can CRUD own conversations" ON public.conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own messages" ON public.messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can CRUD own files" ON public.files
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own usage" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Function: Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: Reset daily session counter
CREATE OR REPLACE FUNCTION public.reset_daily_sessions()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET daily_sessions_used = 0,
      daily_sessions_reset_at = NOW()
  WHERE daily_sessions_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Reset monthly counters
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET monthly_tokens_used = 0,
      monthly_sandbox_seconds_used = 0,
      monthly_reset_at = NOW()
  WHERE monthly_reset_at < date_trunc('month', CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Increment daily sessions (used by tracker)
CREATE OR REPLACE FUNCTION public.increment_daily_sessions(user_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET daily_sessions_used = daily_sessions_used + 1
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
