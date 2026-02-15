-- Advanced Security Mode: disable local->remote fallback when requested by user.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'strict_no_fallback'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN strict_no_fallback BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
