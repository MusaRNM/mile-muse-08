
-- Encrypted cloud sync for MileTrack.
-- Server stores only ciphertext + owner + timestamps; the encryption key is
-- derived from a user passphrase on the client (WebCrypto AES-GCM 256).

CREATE TABLE public.synced_trips (
  id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload_ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX synced_trips_user_updated_idx ON public.synced_trips (user_id, updated_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.synced_trips TO authenticated;
GRANT ALL ON public.synced_trips TO service_role;
ALTER TABLE public.synced_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trips select" ON public.synced_trips FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own trips insert" ON public.synced_trips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own trips update" ON public.synced_trips FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own trips delete" ON public.synced_trips FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.synced_fuel (
  id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload_ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX synced_fuel_user_updated_idx ON public.synced_fuel (user_id, updated_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.synced_fuel TO authenticated;
GRANT ALL ON public.synced_fuel TO service_role;
ALTER TABLE public.synced_fuel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fuel select" ON public.synced_fuel FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own fuel insert" ON public.synced_fuel FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own fuel update" ON public.synced_fuel FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own fuel delete" ON public.synced_fuel FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Per-user salt for PBKDF2 passphrase-derived encryption keys.
-- The salt is not secret (public by design in PBKDF2) but is only readable
-- by the owner so external actors can't enumerate accounts by user_id.
CREATE TABLE public.sync_key_salts (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  key_check_ciphertext TEXT NOT NULL,
  key_check_iv TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_key_salts TO authenticated;
GRANT ALL ON public.sync_key_salts TO service_role;
ALTER TABLE public.sync_key_salts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own salt select" ON public.sync_key_salts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own salt insert" ON public.sync_key_salts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own salt update" ON public.sync_key_salts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
