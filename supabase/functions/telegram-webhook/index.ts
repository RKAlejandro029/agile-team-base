// Telegram bot webhook. Deploy via Supabase Dashboard -> Edge Functions ->
// New function -> paste this file -> Deploy. No CLI required.
//
// This is a separate, standalone serverless function — deliberately outside
// the main app's build. Telegram needs a plain public HTTPS endpoint to POST
// to; the main app's framework only supports its own internal RPC-style
// calls, not arbitrary third-party webhooks. Edge Functions get a public URL
// the moment you deploy, with direct database access via the service-role
// key (set automatically by Supabase, no config needed).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const HELP_TEXT = `Fintreas bot commands:
/today - who's active or on break right now
/leave - who's on approved leave today
/meetings - today's meetings, set up by whom
/tickets - open and overdue tickets
/help - show this list`;

async function sendMessage(botToken: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, todayStr: start.toISOString().slice(0, 10) };
}

async function nameOf(id: string | null): Promise<string> {
  if (!id) return "—";
  const { data } = await supabase.from("profiles").select("full_name, email").eq("id", id).maybeSingle();
  return data?.full_name || data?.email || "Someone";
}

async function handleToday(): Promise<string> {
  const { data: openLogs } = await supabase
    .from("attendance_logs")
    .select("id, user_id")
    .is("clock_out", null);
  if (!openLogs || openLogs.length === 0) return "No one's clocked in right now.";

  const { data: openBreaks } = await supabase
    .from("attendance_breaks")
    .select("attendance_log_id")
    .is("break_end", null);
  const onBreakLogIds = new Set((openBreaks ?? []).map((b) => b.attendance_log_id));

  const lines = await Promise.all(
    openLogs.map(async (l) => {
      const name = await nameOf(l.user_id);
      return `${onBreakLogIds.has(l.id) ? "☕" : "🟢"} ${name}${onBreakLogIds.has(l.id) ? " (on break)" : ""}`;
    }),
  );
  return `<b>Active today (${lines.length})</b>\n${lines.join("\n")}`;
}

async function labelFor(leaveType: string): Promise<string> {
  const { data } = await supabase
    .from("leave_type_settings")
    .select("custom_label")
    .eq("leave_type", leaveType)
    .maybeSingle();
  return data?.custom_label && data.custom_label.trim().length > 0 ? data.custom_label : leaveType;
}

async function handleLeave(): Promise<string> {
  const { todayStr } = todayRange();
  const { data } = await supabase
    .from("leave_requests")
    .select("user_id, leave_type")
    .eq("status", "approved")
    .lte("start_date", todayStr)
    .gte("end_date", todayStr);
  if (!data || data.length === 0) return "No one's on approved leave today.";
  const lines = await Promise.all(
    data.map(async (l) => `🌴 ${await nameOf(l.user_id)} (${await labelFor(l.leave_type)})`),
  );
  return `<b>On leave today (${lines.length})</b>\n${lines.join("\n")}`;
}

async function handleMeetings(): Promise<string> {
  const { start, end } = todayRange();
  const { data } = await supabase
    .from("calendar_events")
    .select("title, start_time, created_by")
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("start_time");
  if (!data || data.length === 0) return "No meetings set up for today.";
  const lines = await Promise.all(
    data.map(async (e) => {
      const time = new Date(e.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `🗓 ${time} — ${e.title} (set up by ${await nameOf(e.created_by)})`;
    }),
  );
  return `<b>Today's meetings (${lines.length})</b>\n${lines.join("\n")}`;
}

async function handleTickets(): Promise<string> {
  const { data } = await supabase
    .from("tickets")
    .select("title, client, status, priority, assigned_to, due_at")
    .in("status", ["open", "in_progress", "waiting_client"])
    .order("created_at", { ascending: false })
    .limit(15);
  if (!data || data.length === 0) return "No open tickets.";
  const now = Date.now();
  const lines = await Promise.all(
    data.map(async (t) => {
      const overdue = t.due_at && new Date(t.due_at).getTime() < now ? " ⚠️OVERDUE" : "";
      const assignee = await nameOf(t.assigned_to);
      return `• [${t.priority}] ${t.title}${t.client ? ` (${t.client})` : ""} — ${assignee}${overdue}`;
    }),
  );
  return `<b>Open tickets (${lines.length})</b>\n${lines.join("\n")}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let update: { message?: { chat?: { id?: number }; text?: string } };
  try {
    update = await req.json();
  } catch {
    return new Response("ignored", { status: 200 });
  }

  const chatId = update.message?.chat?.id?.toString();
  const text = update.message?.text?.trim() ?? "";
  if (!chatId || !text) return new Response("ok", { status: 200 });

  const { data: config } = await supabase.from("telegram_config").select("*").limit(1).maybeSingle();
  if (!config?.bot_token) return new Response("no bot configured", { status: 200 });

  // Linking: /link 123456 — only works while a code is active and unexpired.
  if (text.startsWith("/link")) {
    const code = text.replace("/link", "").trim();
    const validCode =
      config.link_code &&
      config.link_code === code &&
      config.link_code_expires_at &&
      new Date(config.link_code_expires_at) > new Date();
    if (validCode) {
      await supabase
        .from("telegram_config")
        .update({ ceo_chat_id: chatId, link_code: null, link_code_expires_at: null })
        .eq("id", config.id);
      await sendMessage(config.bot_token, chatId, `Linked! ✅\n\n${HELP_TEXT}`);
    } else {
      await sendMessage(config.bot_token, chatId, "That code is invalid or expired. Generate a new one from the app.");
    }
    return new Response("ok", { status: 200 });
  }

  // Everything else is CEO-only.
  if (chatId !== config.ceo_chat_id) {
    await sendMessage(config.bot_token, chatId, "This bot is private. Link it from the CEO settings page in the app.");
    return new Response("ok", { status: 200 });
  }

  let reply: string;
  switch (text.split(" ")[0]) {
    case "/today":
    case "/active":
      reply = await handleToday();
      break;
    case "/leave":
      reply = await handleLeave();
      break;
    case "/meetings":
      reply = await handleMeetings();
      break;
    case "/tickets":
      reply = await handleTickets();
      break;
    case "/help":
    case "/start":
      reply = HELP_TEXT;
      break;
    default:
      reply = `Unknown command.\n\n${HELP_TEXT}`;
  }

  await sendMessage(config.bot_token, chatId, reply);
  return new Response("ok", { status: 200 });
});
