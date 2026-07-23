// Server functions for the CEO's Telegram bot setup. Run server-side only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCeo(supabaseAdmin: Awaited<ReturnType<typeof getAdmin>>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "ceo");
  if (error) throw new Error("Could not verify permissions");
  if (!data || data.length === 0) throw new Error("Forbidden: CEO only");
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const saveBotTokenSchema = z.object({
  botToken: z.string().trim().min(20, "That doesn't look like a valid bot token"),
});

// Saves the token AND registers it with Telegram as the webhook target in one
// step, so the CEO doesn't need to touch curl or Postman — just paste the
// token from BotFather and click Save.
export const saveTelegramBotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => saveBotTokenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    await assertCeo(supabaseAdmin, context.userId);

    const SUPABASE_URL = process.env.SUPABASE_URL;
    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

    const tgRes = await fetch(
      `https://api.telegram.org/bot${data.botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
    );
    const tgJson = await tgRes.json();
    if (!tgJson.ok) {
      throw new Error(`Telegram rejected this token: ${tgJson.description ?? "unknown error"}`);
    }

    const { data: existing } = await supabaseAdmin
      .from("telegram_config")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("telegram_config")
        .update({ bot_token: data.botToken })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("telegram_config").insert({ bot_token: data.botToken });
    }

    return { webhookUrl };
  });

export const generateLinkCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getAdmin();
    await assertCeo(supabaseAdmin, context.userId);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data: existing } = await supabaseAdmin
      .from("telegram_config")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Save a bot token first.");

    await supabaseAdmin
      .from("telegram_config")
      .update({ link_code: code, link_code_expires_at: expires })
      .eq("id", existing.id);

    return { code, expiresAt: expires };
  });

export const disconnectTelegramFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getAdmin();
    await assertCeo(supabaseAdmin, context.userId);

    const { data: existing } = await supabaseAdmin
      .from("telegram_config")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("telegram_config")
        .update({ ceo_chat_id: null })
        .eq("id", existing.id);
    }
    return { ok: true };
  });
