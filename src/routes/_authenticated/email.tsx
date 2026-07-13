import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mail, Reply, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

export const Route = createFileRoute("/_authenticated/email")({
  component: EmailPage,
});

const mockEmails = [
  { id: "1", from: "client@acme.com", fromName: "Sarah Chen (Acme)", subject: "Q3 audit follow-up questions", preview: "Hi — thanks for the summary. A few clarifications on the depreciation schedule…", body: "Hi,\n\nThanks for the summary you sent yesterday. A few clarifications on the depreciation schedule for the fixed assets — could we jump on a call this week to walk through it?\n\nBest,\nSarah", time: new Date(Date.now() - 1000 * 60 * 45) },
  { id: "2", from: "hr@company.com", fromName: "HR Team", subject: "Reminder: Timesheets due Friday", preview: "Please submit your hours by 5pm Friday…", body: "Just a reminder to submit your weekly hours by 5pm Friday.\n\n– HR", time: new Date(Date.now() - 1000 * 60 * 60 * 3) },
  { id: "3", from: "no-reply@calendly.com", fromName: "Calendly", subject: "New booking: Discovery call — Wednesday 3pm", preview: "You have a new booking...", body: "You have a new booking from Marcus Lee for Wednesday at 3:00pm PT.", time: new Date(Date.now() - 1000 * 60 * 60 * 24) },
  { id: "4", from: "vendor@toolset.io", fromName: "Toolset Support", subject: "Your license has been renewed", preview: "Your annual license is active through Nov 2026.", body: "Your annual Toolset license is active through Nov 2026. No action needed.", time: new Date(Date.now() - 1000 * 60 * 60 * 48) },
];

function EmailPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(mockEmails[0].id);
  const [reply, setReply] = useState("");

  const profileQ = useQuery({
    queryKey: ["profile-email", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("outlook_connected, email").eq("id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });

  const connect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ outlook_connected: true }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outlook connected (demo)");
      qc.invalidateQueries({ queryKey: ["profile-email"] });
    },
  });

  const selected = mockEmails.find((e) => e.id === selectedId);

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
        <p className="text-sm text-muted-foreground">Your connected Outlook inbox.</p>
      </div>

      {!profileQ.data?.outlook_connected && (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertTitle>Connect your Outlook mailbox</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>Once connected, your work inbox appears here. (Demo mode uses sample messages.)</span>
            <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>Connect Outlook</Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] min-h-[500px]">
          <div className="border-r">
            <div className="p-3 border-b flex items-center gap-2 bg-muted/40">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Inbox</span>
              <Badge variant="secondary" className="ml-auto">{mockEmails.length}</Badge>
            </div>
            <div className="divide-y">
              {mockEmails.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={cn("w-full text-left p-3 hover:bg-accent transition", selectedId === m.id && "bg-accent")}
                >
                  <div className="flex justify-between items-baseline gap-2">
                    <p className="text-sm font-medium truncate">{m.fromName}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatDistanceToNowStrict(m.time)}</span>
                  </div>
                  <p className="text-sm truncate">{m.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.preview}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            {selected ? (
              <>
                <CardHeader>
                  <CardTitle className="text-base">{selected.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground">From: {selected.fromName} &lt;{selected.from}&gt;</p>
                </CardHeader>
                <CardContent className="flex-1">
                  <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{selected.body}</pre>
                </CardContent>
                <div className="p-4 border-t bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Reply className="h-4 w-4" /> Reply
                  </div>
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${selected.fromName}...`} rows={3} />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => { toast.success("Reply sent (demo)"); setReply(""); }} disabled={!reply.trim()}>Send</Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a message</div>
            )}
          </div>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Note: real Outlook integration requires Microsoft Graph API and OAuth wiring. This view uses mock data for now.
      </p>
    </div>
  );
}
