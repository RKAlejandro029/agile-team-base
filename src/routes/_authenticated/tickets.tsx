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
import { Plus, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "open" | "in_progress" | "waiting_client" | "done";

const priorityColor: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

const statusColor: Record<Status, string> = {
  open: "bg-info/10 text-info",
  in_progress: "bg-warning/10 text-warning",
  waiting_client: "bg-muted text-muted-foreground",
  done: "bg-success/10 text-success",
};

const statusLabel: Record<Status, string> = {
  open: "Open",
  in_progress: "Ongoing",
  waiting_client: "Waiting on client",
  done: "Done",
};

const TICKET_CATEGORIES = [
  "Bug",
  "Access request",
  "Data / reporting",
  "Infrastructure",
  "Client request",
  "Other",
];

export const Route = createFileRoute("/_authenticated/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [issue, setIssue] = useState("");
  const [client, setClient] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [comment, setComment] = useState("");

  // Everyone the ticket could be assigned to. CEO/Admin can hand a ticket to
  // any consultant (or themselves); a consultant filing one can still assign
  // it to a colleague or keep it for themselves.
  // Uses get_profiles_directory() rather than querying profiles directly —
  // profiles RLS only lets a non-admin see their OWN row, so a plain
  // supabase.from("profiles") lookup here would silently return nobody.
  const peopleQ = useQuery({
    queryKey: ["ticket-assignees"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_directory");
      if (error) throw error;
      return (data ?? [])
        .slice()
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    },
  });

  const ticketsQ = useQuery({
    queryKey: ["tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      // creator/assignee aren't embedded via FK here because tickets.created_by
      // and .assigned_to reference auth.users, not profiles directly —
      // PostgREST can't resolve that as an embed. And a plain profiles query
      // wouldn't work for non-admins anyway (RLS only allows your own row),
      // so this uses the same directory RPC as peopleQ.
      const { data: directory } = await supabase.rpc("get_profiles_directory");
      const byId = new Map((directory ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        creator: byId.get(r.created_by) ?? null,
        assignee: r.assigned_to ? (byId.get(r.assigned_to) ?? null) : null,
      }));
    },
    enabled: !!user,
  });

  const detailQ = useQuery({
    queryKey: ["ticket-updates", detailId],
    queryFn: async () => {
      if (!detailId) return [];
      const { data, error } = await supabase
        .from("ticket_updates")
        .select("*")
        .eq("ticket_id", detailId)
        .order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const { data: directory } = await supabase.rpc("get_profiles_directory");
      const byId = new Map((directory ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
    },
    enabled: !!detailId,
  });

  const assignmentHistoryQ = useQuery({
    queryKey: ["ticket-assignment-history", detailId],
    queryFn: async () => {
      if (!detailId) return [];
      const { data, error } = await supabase
        .from("ticket_assignment_history")
        .select("*")
        .eq("ticket_id", detailId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const { data: directory } = await supabase.rpc("get_profiles_directory");
      const byId = new Map((directory ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        from: r.from_user ? (byId.get(r.from_user) ?? null) : null,
        to: r.to_user ? (byId.get(r.to_user) ?? null) : null,
        by: r.changed_by ? (byId.get(r.changed_by) ?? null) : null,
      }));
    },
    enabled: !!detailId,
  });

  const reassign = useMutation({
    mutationFn: async ({ id, assignedTo: newAssignee }: { id: string; assignedTo: string }) => {
      const { error } = await supabase
        .from("tickets")
        .update({ assigned_to: newAssignee })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket reassigned");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-assignment-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tickets").insert({
        title: issue,
        client: client || null,
        category: category || null,
        description,
        priority,
        created_by: user!.id,
        assigned_to: assignedTo || user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket created");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setOpen(false);
      setIssue("");
      setClient("");
      setCategory("");
      setDescription("");
      setPriority("medium");
      setAssignedTo("");
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
    waiting_client: (ticketsQ.data ?? []).filter((t) => t.status === "waiting_client").length,
    done: (ticketsQ.data ?? []).filter((t) => t.status === "done").length,
  };
  const isOverdue = (t: { due_at: string | null; status: string }) =>
    !!t.due_at && t.status !== "done" && new Date(t.due_at) < new Date();

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
              <SelectItem value="waiting_client">Waiting on client</SelectItem>
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
                  <Label>Issue</Label>
                  <Input
                    required
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    placeholder="e.g. Login page throws 500 error"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Input
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="Which client is this for?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="What kind of issue is this?" />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="What's happening, steps to reproduce, and what's expected instead"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="space-y-2">
                    <Label>Assign to</Label>
                    <Select
                      value={assignedTo || "self"}
                      onValueChange={(v) => setAssignedTo(v === "self" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Myself</SelectItem>
                        {peopleQ.data
                          ?.filter((p) => p.id !== user?.id)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name || "Unnamed"}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
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
          of their queue at a glance without opening the dropdown. */}
      <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0 overflow-hidden rounded-md border">
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
          active={filter === "waiting_client"}
          onClick={() => setFilter(filter === "waiting_client" ? "all" : "waiting_client")}
          label="Waiting on client"
          count={counts.waiting_client}
          className={statusColor.waiting_client}
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
          const creator = (t as unknown as { creator: { full_name: string } | null }).creator;
          const assignee = (t as unknown as { assignee: { full_name: string } | null }).assignee;
          return (
            <Card
              key={t.id}
              className="cursor-pointer hover:border-primary/50 transition"
              onClick={() => setDetailId(t.id)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
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
                      {statusLabel[t.status as Status]}
                    </Badge>
                    {isOverdue(t) && (
                      <Badge className="bg-destructive/15 text-destructive" variant="secondary">
                        Overdue
                      </Badge>
                    )}
                    {t.category && (
                      <span className="text-xs text-muted-foreground">· {t.category}</span>
                    )}
                    {t.client && (
                      <span className="text-xs text-muted-foreground">· {t.client}</span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <UserCircle2 className="h-3 w-3" />
                    {assignee?.full_name || "Unassigned"}
                    <span className="mx-1">·</span>
                    Filed by {creator?.full_name || "someone"} · Updated{" "}
                    {format(new Date(t.updated_at), "MMM d, h:mm a")}
                    {t.due_at && t.status !== "done" && (
                      <>
                        <span className="mx-1">·</span>
                        <span className={isOverdue(t) ? "text-destructive" : ""}>
                          Due {format(new Date(t.due_at), "MMM d, h:mm a")}
                        </span>
                      </>
                    )}
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
                    <SelectItem value="waiting_client">Waiting on client</SelectItem>
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
              <div className="flex flex-wrap gap-2">
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
                  {statusLabel[detail.status as Status]}
                </Badge>
                {detail.client && <Badge variant="outline">{detail.client}</Badge>}
                {detail.category && <Badge variant="outline">{detail.category}</Badge>}
              </div>
              {detail.description && (
                <p className="text-sm whitespace-pre-wrap">{detail.description}</p>
              )}
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Due by</p>
                  <p
                    className={
                      detail.due_at && isOverdue(detail)
                        ? "font-medium text-destructive"
                        : "font-medium"
                    }
                  >
                    {detail.due_at ? format(new Date(detail.due_at), "MMM d, h:mm a") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">First response</p>
                  <p className="font-medium">
                    {detail.first_response_at
                      ? format(new Date(detail.first_response_at), "MMM d, h:mm a")
                      : "Awaiting"}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned to</Label>
                <Select
                  value={detail.assigned_to ?? "unassigned"}
                  onValueChange={(v) => reassign.mutate({ id: detail.id, assignedTo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {peopleQ.data?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {assignmentHistoryQ.data && assignmentHistoryQ.data.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-2">Reassignment history</h3>
                  <div className="space-y-1.5">
                    {assignmentHistoryQ.data.map((h) => (
                      <p key={h.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {h.from?.full_name || "Unassigned"}
                        </span>{" "}
                        →{" "}
                        <span className="font-medium text-foreground">
                          {h.to?.full_name || "Unassigned"}
                        </span>{" "}
                        by {h.by?.full_name || "someone"} ·{" "}
                        {format(new Date(h.changed_at), "MMM d, h:mm a")}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="font-medium text-sm mb-2">Activity</h3>
                <div className="space-y-2">
                  {detailQ.data?.map((u) => {
                    const p = (u as unknown as { profiles: { full_name: string } | null }).profiles;
                    return (
                      <div key={u.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                        <p className="text-xs text-muted-foreground">
                          {p?.full_name || "Unnamed"} ·{" "}
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
