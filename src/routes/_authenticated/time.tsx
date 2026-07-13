import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Square } from "lucide-react";
import { formatDistanceStrict, format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/time")({
  component: TimePage,
});

function TimePage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const logsQ = useQuery({
    queryKey: ["attendance-logs", role, user?.id],
    queryFn: async () => {
      let q = supabase.from("attendance_logs").select("*, profiles!attendance_logs_user_id_fkey(full_name, email)").order("clock_in", { ascending: false }).limit(200);
      if (role !== "admin") q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const openLog = logsQ.data?.find((l) => l.user_id === user?.id && !l.clock_out);

  const clock = useMutation({
    mutationFn: async () => {
      if (openLog) {
        const { error } = await supabase.from("attendance_logs").update({ clock_out: new Date().toISOString() }).eq("id", openLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_logs").insert({ user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(openLog ? "Clocked out" : "Clocked in");
      qc.invalidateQueries({ queryKey: ["attendance-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time tracking</h1>
          <p className="text-sm text-muted-foreground">
            {role === "admin" ? "All consultant attendance across the team." : "Your clock-in / clock-out history."}
          </p>
        </div>
        <Button size="lg" variant={openLog ? "destructive" : "default"} onClick={() => clock.mutate()} disabled={clock.isPending}>
          {openLog ? <><Square className="h-4 w-4 mr-2" /> Clock out</> : <><Play className="h-4 w-4 mr-2" /> Clock in</>}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {role === "admin" && <TableHead>Consultant</TableHead>}
                <TableHead>Date</TableHead>
                <TableHead>Clock in</TableHead>
                <TableHead>Clock out</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsQ.data?.map((log) => {
                const dur = log.clock_out
                  ? formatDistanceStrict(new Date(log.clock_out), new Date(log.clock_in))
                  : "In progress";
                const profile = (log as unknown as { profiles: { full_name: string; email: string } | null }).profiles;
                return (
                  <TableRow key={log.id}>
                    {role === "admin" && <TableCell className="font-medium">{profile?.full_name || profile?.email || "—"}</TableCell>}
                    <TableCell>{format(new Date(log.clock_in), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(log.clock_in), "h:mm a")}</TableCell>
                    <TableCell>{log.clock_out ? format(new Date(log.clock_out), "h:mm a") : "—"}</TableCell>
                    <TableCell className="text-right">{dur}</TableCell>
                  </TableRow>
                );
              })}
              {logsQ.data?.length === 0 && (
                <TableRow><TableCell colSpan={role === "admin" ? 5 : 4} className="text-center text-muted-foreground py-8">No entries yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
