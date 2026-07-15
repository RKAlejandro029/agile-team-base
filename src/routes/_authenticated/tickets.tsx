import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "open" | "in_progress" | "done";

const priorityColor: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

const statusColor: Record<Status, string> = {
  open: "bg-info/10 text-info",
  in_progress: "bg-warning/10 text-warning",
  done: "bg-success/10 text-success",
};

export const Route = createFileRoute("/_authenticated/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [comment, setComment] = useState("");

  const ticketsQ = useQuery({
    queryKey: ["tickets", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("*, creator:profiles!tickets_created_by_fkey(full_name, email)")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const detailQ = useQuery({
    queryKey: ["ticket-updates", detailId],
    queryFn: async () => {
      if (!detailId) return [];
      const { data } = await supabase
        .from("ticket_updates")
        .select("*, profiles!ticket_updates_user_id_fkey(full_name, email)")
        .eq("ticket_id", detailId)
        .order("created_at");
      return data ?? [];
    },
    enabled: !!detailId,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tickets").insert({
        title,
        description,
        priority,
        created_by: user!.id,
        assigned_to: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket created");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setPriority("medium");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("tickets").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!detailId || !comment.trim()) return;
      const { error } = await supabase.from("ticket_updates").insert({
        ticket_id: detailId,
        user_id: user!.id,
        content: comment.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["ticket-updates", detailId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const filtered = (ticketsQ.data ?? []).filter((t) => filter === "all" || t.status === filter);
  const detail = ticketsQ.data?.find((t) => t.id === detailId);
  const counts = {
    open: (ticketsQ.data ?? []).filter((t) => t.status === "open").length,
    in_progress: (ticketsQ.data ?? []).filter((t) => t.status === "in_progress").length,
    done: (ticketsQ.data ?? []).filter((t) => t.status === "done").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Every ticket across the team, open to done.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Status | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New ticket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New ticket</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status chips — click to filter, always visible so anyone can see the shape
          of the team's queue at a glance without opening the dropdown. */}
      <div className="grid grid-cols-3 divide-x overflow-hidden rounded-md border">
        <StatusChip
          active={filter === "open"}
          onClick={() => setFilter(filter === "open" ? "all" : "open")}
          label="Open"
          count={counts.open}
          className={statusColor.open}
        />
        <StatusChip
          active={filter === "in_progress"}
          onClick={() => setFilter(filter === "in_progress" ? "all" : "in_progress")}
          label="Ongoing"
          count={counts.in_progress}
          className={statusColor.in_progress}
        />
        <StatusChip
          active={filter === "done"}
          onClick={() => setFilter(filter === "done" ? "all" : "done")}
          label="Done"
          count={counts.done}
          className={statusColor.done}
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((t) => {
          const creator = (t as unknown as { creator: { full_name: string; email: string } | null })
            .creator;
          return (
            <Card
              key={t.id}
              className="cursor-pointer hover:border-primary/50 transition"
              onClick={() => setDetailId(t.id)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{t.title}</p>
                    <Badge
                      className={cn("capitalize", priorityColor[t.priority as Priority])}
                      variant="secondary"
                    >
                      {t.priority}
                    </Badge>
                    <Badge
                      className={cn("capitalize", statusColor[t.status as Status])}
                      variant="secondary"
                    >
                      {t.status.replace("_", " ")}
                    </Badge>
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    By {creator?.full_name || creator?.email} · Updated{" "}
                    {format(new Date(t.updated_at), "MMM d, h:mm a")}
                  </p>
                </div>
                <Select
                  value={t.status}
                  onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v as Status })}
                >
                  <SelectTrigger className="w-36" onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No tickets.</p>
        )}
      </div>

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.title}</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Badge
                  className={cn("capitalize", priorityColor[detail.priority as Priority])}
                  variant="secondary"
                >
                  {detail.priority}
                </Badge>
                <Badge
                  className={cn("capitalize", statusColor[detail.status as Status])}
                  variant="secondary"
                >
                  {detail.status.replace("_", " ")}
                </Badge>
              </div>
              {detail.description && (
                <p className="text-sm whitespace-pre-wrap">{detail.description}</p>
              )}
              <div>
                <h3 className="font-medium text-sm mb-2">Activity</h3>
                <div className="space-y-2">
                  {detailQ.data?.map((u) => {
                    const p = (
                      u as unknown as { profiles: { full_name: string; email: string } | null }
                    ).profiles;
                    return (
                      <div key={u.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                        <p className="text-xs text-muted-foreground">
                          {p?.full_name || p?.email} ·{" "}
                          {format(new Date(u.created_at), "MMM d, h:mm a")}
                        </p>
                        <p>{u.content}</p>
                      </div>
                    );
                  })}
                  {detailQ.data?.length === 0 && (
                    <p className="text-xs text-muted-foreground">No updates yet.</p>
                  )}
                </div>
              </div>
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addComment.mutate();
                }}
              >
                <Textarea
                  placeholder="Add an update..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button type="submit" size="sm" disabled={!comment.trim()}>
                  Post update
                </Button>
              </form>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusChip({
  label,
  count,
  active,
  onClick,
  className,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-accent/40 sm:px-5",
        active && "bg-accent/60",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.14em] px-1.5 py-0.5 rounded",
          className,
        )}
      >
        {label}
      </span>
      <span className="font-mono-data text-2xl leading-none text-foreground">{count}</span>
    </button>
  );
}
