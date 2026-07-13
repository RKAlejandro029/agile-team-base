import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, type UserStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, Calendar, Ticket, PlaneTakeoff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

interface ConsultantRow {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  current_task: string | null;
  status: UserStatus;
  activeSince: Date | null;
}

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [profilesRes, rolesRes, attendanceRes, leaveRes, ticketsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department, current_task"),
        supabase.from("user_roles").select("user_id, role").eq("role", "consultant"),
        supabase.from("attendance_logs").select("id, user_id, clock_in, clock_out").order("clock_in", { ascending: false }).limit(500),
        supabase.from("leave_requests").select("id, user_id, status, start_date, end_date").eq("status", "approved").lte("start_date", today).gte("end_date", today),
        supabase.from("tickets").select("id, status").in("status", ["open", "in_progress"]),
      ]);

      const consultantIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      const profiles = (profilesRes.data ?? []).filter((p) => consultantIds.has(p.id));
      const onLeave = new Set((leaveRes.data ?? []).map((l) => l.user_id));

      const latestByUser = new Map<string, { clock_in: string; clock_out: string | null }>();
      for (const log of attendanceRes.data ?? []) {
        if (!latestByUser.has(log.user_id)) {
          latestByUser.set(log.user_id, { clock_in: log.clock_in, clock_out: log.clock_out });
        }
      }

      const consultants: ConsultantRow[] = profiles.map((p) => {
        const latest = latestByUser.get(p.id);
        let status: UserStatus = "offline";
        let activeSince: Date | null = null;
        if (onLeave.has(p.id)) status = "leave";
        else if (latest && !latest.clock_out) {
          status = "active";
          activeSince = new Date(latest.clock_in);
        }
        return {
          id: p.id,
          full_name: p.full_name || p.email,
          email: p.email,
          department: p.department,
          current_task: p.current_task,
          status,
          activeSince,
        };
      });

      return {
        consultants,
        activeCount: consultants.filter((c) => c.status === "active").length,
        onLeaveCount: consultants.filter((c) => c.status === "leave").length,
        openTickets: ticketsRes.data?.length ?? 0,
      };
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team overview</h1>
        <p className="text-sm text-muted-foreground">Live view of who's active, on leave, and what they're working on.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Active now" value={data?.activeCount ?? "—"} tone="success" />
        <StatCard icon={<PlaneTakeoff className="h-4 w-4" />} label="On leave today" value={data?.onLeaveCount ?? "—"} tone="info" />
        <StatCard icon={<Ticket className="h-4 w-4" />} label="Open tickets" value={data?.openTickets ?? "—"} tone="warning" />
        <StatCard icon={<Calendar className="h-4 w-4" />} label="Total consultants" value={data?.consultants.length ?? "—"} tone="muted" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consultants</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : data?.consultants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No consultants yet. Ask team members to sign up.</p>
          ) : (
            <div className="divide-y">
              {data?.consultants.map((c) => (
                <div key={c.id} className="flex items-center gap-4 py-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{c.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{c.full_name}</p>
                      <StatusBadge status={c.status} />
                      {c.activeSince && (
                        <span className="text-xs text-muted-foreground">Active for {formatDistanceToNowStrict(c.activeSince)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.current_task || <em className="opacity-60">No status set</em>}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/messages" search={{ to: c.id } as never}>
                      <MessageSquare className="h-4 w-4 mr-1" /> Message
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: "success" | "info" | "warning" | "muted" }) {
  const toneClass = {
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    warning: "bg-warning/10 text-warning",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
