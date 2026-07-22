import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Ticket, UserCircle2, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Ctrl/Cmd+K opens it from anywhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const q = query.trim();

  const ticketsQ = useQuery({
    queryKey: ["search-tickets", q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, title, client, status")
        .or(`title.ilike.%${q}%,client.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && q.length >= 2,
  });

  const peopleQ = useQuery({
    queryKey: ["search-people", q],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_directory");
      if (error) throw error;
      const needle = q.toLowerCase();
      return (data ?? [])
        .filter((p) => (p.full_name || "").toLowerCase().includes(needle))
        .slice(0, 6);
    },
    enabled: open && q.length >= 2,
  });

  const messagesQ = useQuery({
    queryKey: ["search-messages", q, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, sender_id, receiver_id, created_at")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && q.length >= 2 && !!user,
  });

  function go(to: string) {
    setOpen(false);
    setQuery("");
    navigate({ to });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full max-w-xs justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono-data text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search tickets, people, messages..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {q.length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
          ) : (
            <>
              <CommandEmpty>No results.</CommandEmpty>
              {ticketsQ.data && ticketsQ.data.length > 0 && (
                <CommandGroup heading="Tickets">
                  {ticketsQ.data.map((t) => (
                    <CommandItem key={t.id} onSelect={() => go("/tickets")}>
                      <Ticket className="mr-2 h-4 w-4 text-info" />
                      <span className="truncate">{t.title}</span>
                      {t.client && (
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {t.client}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {peopleQ.data && peopleQ.data.length > 0 && (
                <CommandGroup heading="People">
                  {peopleQ.data.map((p) => (
                    <CommandItem key={p.id} onSelect={() => setOpen(false)}>
                      <UserCircle2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      {p.full_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {messagesQ.data && messagesQ.data.length > 0 && (
                <CommandGroup heading="Messages">
                  {messagesQ.data.map((m) => (
                    <CommandItem key={m.id} onSelect={() => go("/messages")}>
                      <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{m.content}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
