import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  saveTelegramBotFn,
  generateLinkCodeFn,
  disconnectTelegramFn,
} from "@/functions/telegram.functions";

export const Route = createFileRoute("/_authenticated/telegram-bot")({
  component: TelegramBotPage,
});

function TelegramBotPage() {
  const { isCeo } = useAuth();
  const qc = useQueryClient();
  const [botToken, setBotToken] = useState("");
  const [linkCode, setLinkCode] = useState<string | null>(null);

  const configQ = useQuery({
    queryKey: ["telegram-config"],
    queryFn: async () => {
      const { data } = await supabase.from("telegram_config").select("*").limit(1).maybeSingle();
      return data;
    },
    enabled: isCeo,
  });

  const saveToken = useMutation({
    mutationFn: async () => saveTelegramBotFn({ data: { botToken } }),
    onSuccess: () => {
      toast.success("Bot connected and webhook registered");
      setBotToken("");
      qc.invalidateQueries({ queryKey: ["telegram-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genCode = useMutation({
    mutationFn: async () => generateLinkCodeFn(),
    onSuccess: (res) => {
      setLinkCode(res.code);
      qc.invalidateQueries({ queryKey: ["telegram-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async () => disconnectTelegramFn(),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["telegram-config"] });
    },
  });

  if (!isCeo) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">CEO only.</p>
      </div>
    );
  }

  const hasToken = !!configQ.data?.bot_token;
  const isLinked = !!configQ.data?.ceo_chat_id;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Telegram bot</h1>
          <p className="text-sm text-muted-foreground">
            Get team status on demand — who's active, who's on leave, meetings, and open tickets.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 — Create the bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            In Telegram, message{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              @BotFather
            </a>
            , send <code className="rounded bg-muted px-1 py-0.5">/newbot</code>, and follow the
            prompts. It'll give you a token that looks like{" "}
            <code className="rounded bg-muted px-1 py-0.5">123456:ABC-def...</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 — Deploy the webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            In your Supabase dashboard, go to <strong>Edge Functions → New function</strong>, name
            it <code className="rounded bg-muted px-1 py-0.5">telegram-webhook</code>, and paste in
            the code from{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              supabase/functions/telegram-webhook/index.ts
            </code>{" "}
            in your repo. Deploy it. No command line needed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 3 — Connect</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasToken && (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Bot token saved
            </p>
          )}
          <div className="space-y-2">
            <Label>Bot token</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={hasToken ? "Paste a new token to replace it" : "123456:ABC-def..."}
              />
              <Button
                onClick={() => saveToken.mutate()}
                disabled={!botToken || saveToken.isPending}
              >
                {saveToken.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {hasToken && (
            <div className="space-y-2 border-t pt-4">
              {isLinked ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Linked to your Telegram account
                  </p>
                  <Button variant="outline" size="sm" onClick={() => disconnect.mutate()}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <Label>Link your Telegram account</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate a code, then message your bot on Telegram with{" "}
                    <code className="rounded bg-muted px-1 py-0.5">/link CODE</code>.
                  </p>
                  {linkCode ? (
                    <div className="flex items-center gap-2">
                      <code className="rounded-md border bg-muted px-4 py-2 font-mono-data text-lg">
                        /link {linkCode}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(`/link ${linkCode}`);
                          toast.success("Copied");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => genCode.mutate()} disabled={genCode.isPending}>
                      {genCode.isPending ? "Generating…" : "Generate code"}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">Codes expire after 15 minutes.</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLinked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <code className="rounded bg-muted px-1 py-0.5">/today</code> — who's active or on
              break right now
            </p>
            <p>
              <code className="rounded bg-muted px-1 py-0.5">/leave</code> — who's on approved leave
              today
            </p>
            <p>
              <code className="rounded bg-muted px-1 py-0.5">/meetings</code> — today's meetings,
              set up by whom
            </p>
            <p>
              <code className="rounded bg-muted px-1 py-0.5">/tickets</code> — open and overdue
              tickets
            </p>
            <p>
              <code className="rounded bg-muted px-1 py-0.5">/help</code> — show the command list
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
