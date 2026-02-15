-- Execution backend preference per user

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'sandbox_provider'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN sandbox_provider TEXT NOT NULL DEFAULT 'remote_e2b';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_sandbox_provider_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_sandbox_provider_check
      CHECK (sandbox_provider IN ('remote_e2b', 'local_microvm'));
  END IF;
END $$;
