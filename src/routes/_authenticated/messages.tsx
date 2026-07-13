import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const contactsQ = useQuery({
    queryKey: ["contacts", user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_profiles_directory");
      return (data ?? []).filter((c) => c.id !== user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const messagesQ = useQuery({
    queryKey: ["messages", user?.id, selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${selectedId}),and(sender_id.eq.${selectedId},receiver_id.eq.${user!.id})`)
        .order("created_at");
      return data ?? [];
    },
    enabled: !!user && !!selectedId,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("messages-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messagesQ.data]);

  const send = useMutation({
    mutationFn: async () => {
      const content = draft.trim();
      if (!content || !selectedId) return;
      const { error } = await supabase.from("messages").insert({
        sender_id: user!.id, receiver_id: selectedId, content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  const selected = contactsQ.data?.find((c) => c.id === selectedId);

  return (
    <div className="h-[calc(100vh-3.5rem)] grid grid-cols-1 md:grid-cols-[280px_1fr]">
      <div className="border-r bg-card">
        <div className="p-4 border-b"><h2 className="font-semibold">Messages</h2></div>
        <ScrollArea className="h-[calc(100%-57px)]">
          {contactsQ.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 hover:bg-accent text-left transition",
                selectedId === c.id && "bg-accent"
              )}
            >
              <Avatar className="h-9 w-9"><AvatarFallback>{(c.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.full_name || "Unnamed"}</p>
                {c.department && <p className="text-xs text-muted-foreground truncate">{c.department}</p>}
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>

      <div className="flex flex-col h-full">
        {selected ? (
          <>
            <div className="p-4 border-b bg-card flex items-center gap-3">
              <Avatar className="h-8 w-8"><AvatarFallback>{(selected.full_name || selected.email).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div><p className="font-medium">{selected.full_name || selected.email}</p><p className="text-xs text-muted-foreground">{selected.email}</p></div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {messagesQ.data?.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <p>{m.content}</p>
                      <p className={cn("text-[10px] mt-1", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {format(new Date(m.created_at), "p")}
                      </p>
                    </div>
                  </div>
                );
              })}
              {messagesQ.data?.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Say hi 👋</p>}
            </div>
            <form
              className="p-3 border-t bg-card flex gap-2"
              onSubmit={(e) => { e.preventDefault(); send.mutate(); }}
            >
              <Input placeholder="Type a message..." value={draft} onChange={(e) => setDraft(e.target.value)} />
              <Button type="submit" disabled={!draft.trim()}><Send className="h-4 w-4" /></Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-8 text-center text-muted-foreground max-w-sm">
              <p className="text-sm">Select a teammate to start chatting.</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
