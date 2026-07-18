import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  LogIn,
  LogOut as LogOutIcon,
  Ticket,
  CheckCircle2,
  CalendarDays,
  CalendarCheck,
  CalendarX,
  UserPlus,
  UserMinus,
  History as HistoryIcon,
} from "lucide-react";
import { format, isSameDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

const ACTION_META: Record<string, { label: string; icon: typeof LogIn; tone: string }> = {
  clock_in: { label: "Clocked in", icon: LogIn, tone: "text-success" },
  clock_out: { label: "Clocked out", icon: LogOutIcon, tone: "text-muted-foreground" },
  ticket_created: { label: "Created a ticket", icon: Ticket, tone: "text-info" },
  ticket_completed: { label: "Completed a ticket", icon: CheckCircle2, tone: "text-success" },
  leave_filed: { label: "Filed leave", icon: CalendarDays, tone: "text-warning" },
  leave_approved: { label: "Approved leave for", icon: CalendarCheck, tone: "text-success" },
  leave_rejected: { label: "Rejected leave for", icon: CalendarX, tone: "text-destructive" },
  user_created: { label: "Created a user", icon: UserPlus, tone: "text-info" },
  user_deleted: { label: "Deleted a user", icon: UserMinus, tone: "text-destructive" },
};

function HistoryPage() {
  const { isCeo } = useAuth();
  const [userFilter, setUserFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const peopleQ = useQuery({
    queryKey: ["history-people"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email").order("full_name")).data ??
      [],
    enabled: isCeo,
  });

  const logQ = useQuery({
    queryKey: ["activity-log", userFilter, fromDate, toDate],
    queryFn: async () => {
      let q = supabase
        .from("activity_log")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (userFilter !== "all") {
        q = q.or(`actor_id.eq.${userFilter},target_user_id.eq.${userFilter}`);
      }
      if (fromDate) q = q.gte("occurred_at", `${fromDate}T00:00:00`);
      if (toDate) q = q.lte("occurred_at", `${toDate}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const ids = [
        ...new Set(rows.flatMap((r) => [r.actor_id, r.target_user_id]).filter(Boolean)),
      ] as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        actor: r.actor_id ? (byId.get(r.actor_id) ?? null) : null,
        target: r.target_user_id ? (byId.get(r.target_user_id) ?? null) : null,
      }));
    },
    enabled: isCeo,
  });

  if (!isCeo) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">CEO only.</p>
      </div>
    );
  }

  // Grouped per day, most recent first — each day's events stay in
  // chronological order for readability.
  const groups: { day: Date; items: NonNullable<typeof logQ.data> }[] = [];
  for (const row of logQ.data ?? []) {
    const occurred = new Date(row.occurred_at);
    const existing = groups.find((g) => isSameDay(g.day, occurred));
    if (existing) existing.items.push(row);
    else groups.push({ day: occurred, items: [row] });
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <HistoryIcon className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            Every clock in/out, ticket, leave filing, and approval — everyone, everywhere.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Person</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {peopleQ.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
          {(userFilter !== "all" || fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUserFilter("all");
                setFromDate("");
                setToDate("");
              }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {groups.map(({ day, items }) => (
          <div key={day.toISOString()}>
            <p className="mb-2 font-mono-data text-xs uppercase tracking-wider text-muted-foreground">
              {format(day, "EEEE, MMMM d, yyyy")}
            </p>
            <div className="divide-y rounded-md border">
              {items.map((row) => {
                const meta = ACTION_META[row.action] ?? {
                  label: row.action,
                  icon: HistoryIcon,
                  tone: "text-muted-foreground",
                };
                const Icon = meta.icon;
                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">
                          {row.actor?.full_name || row.actor?.email || "Someone"}
                        </span>{" "}
                        {meta.label}
                        {row.target && row.target_user_id !== row.actor_id && (
                          <>
                            {" "}
                            <span className="font-medium">
                              {row.target.full_name || row.target.email}
                            </span>
                          </>
                        )}
                        {row.detail && (
                          <span className="text-muted-foreground"> — {row.detail}</span>
                        )}
                      </p>
                      <p className="font-mono-data text-xs text-muted-foreground">
                        {format(new Date(row.occurred_at), "h:mm:ss a")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No activity for this filter.
          </p>
        )}
      </div>
    </div>
  );
}
