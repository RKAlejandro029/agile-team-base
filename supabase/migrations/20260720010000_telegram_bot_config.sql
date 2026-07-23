-- Single-row config for the CEO's Telegram notification bot. The bot token
-- and chat id are only ever read by the Edge Function using the service-role
-- key (which bypasses RLS entirely) — from the app's own client, only the
-- CEO can see or touch this row at all.
CREATE TABLE public.telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token TEXT,
  ceo_chat_id TEXT,
  link_code TEXT,
  link_code_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.telegram_config TO authenticated;
GRANT ALL ON public.telegram_config TO service_role;
ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CEO manages telegram config" ON public.telegram_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
