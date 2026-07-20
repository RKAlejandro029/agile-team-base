import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDown, FileBarChart } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { isCeo } = useAuth();
  const [userFilter, setUserFilter] = useState("all");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generating, setGenerating] = useState(false);

  const peopleQ = useQuery({
    queryKey: ["report-people"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email").order("full_name")).data ??
      [],
    enabled: isCeo,
  });

  if (!isCeo) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">CEO only.</p>
      </div>
    );
  }

  const personLabel =
    userFilter === "all"
      ? "Everyone"
      : peopleQ.data?.find((p) => p.id === userFilter)?.full_name || "Person";

  async function generateReport() {
    setGenerating(true);
    try {
      const fromISO = `${fromDate}T00:00:00`;
      const toISO = `${toDate}T23:59:59`;

      let ticketsQuery = supabase
        .from("tickets")
        .select(
          "id, title, client, status, priority, created_by, assigned_to, created_at, updated_at",
        )
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (userFilter !== "all") ticketsQuery = ticketsQuery.eq("assigned_to", userFilter);

      let eventsQuery = supabase
        .from("calendar_events")
        .select("id, title, start_time, end_time, created_by")
        .gte("start_time", fromISO)
        .lte("start_time", toISO);
      if (userFilter !== "all") eventsQuery = eventsQuery.eq("created_by", userFilter);

      let leaveQuery = supabase
        .from("leave_requests")
        .select("id, user_id, leave_type, status, start_date, end_date, created_at")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (userFilter !== "all") leaveQuery = leaveQuery.eq("user_id", userFilter);

      let attendanceQuery = supabase
        .from("attendance_logs")
        .select("id, user_id, clock_in, clock_out")
        .gte("clock_in", fromISO)
        .lte("clock_in", toISO);
      if (userFilter !== "all") attendanceQuery = attendanceQuery.eq("user_id", userFilter);

      const [ticketsRes, eventsRes, leaveRes, attendanceRes, profilesRes] = await Promise.all([
        ticketsQuery,
        eventsQuery,
        leaveQuery,
        attendanceQuery,
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      const byId = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name || p.email]));
      const nameOf = (id: string | null) => (id ? (byId.get(id) ?? id) : "—");

      const tickets = ticketsRes.data ?? [];
      const events = eventsRes.data ?? [];
      const leave = leaveRes.data ?? [];
      const attendance = attendanceRes.data ?? [];

      const wb = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ["Fintreas KPI Report"],
        ["Person", personLabel],
        ["From", fromDate],
        ["To", toDate],
        [],
        ["Metric", "Value"],
        ["Tickets logged", tickets.length],
        ["Tickets completed", tickets.filter((t) => t.status === "done").length],
        ["Meetings set up", events.length],
        ["Leave requests filed", leave.length],
        ["Leave days approved", leave.filter((l) => l.status === "approved").length],
        ["Shifts clocked", attendance.length],
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      const ticketRows = [
        [
          "Issue",
          "Client",
          "Status",
          "Priority",
          "Assigned to",
          "Created by",
          "Created",
          "Updated",
        ],
        ...tickets.map((t) => [
          t.title,
          t.client || "",
          t.status,
          t.priority,
          nameOf(t.assigned_to),
          nameOf(t.created_by),
          format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
          format(new Date(t.updated_at), "yyyy-MM-dd HH:mm"),
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ticketRows), "Tickets");

      const meetingRows = [
        ["Title", "Set up by", "Start", "End"],
        ...events.map((e) => [
          e.title,
          nameOf(e.created_by),
          format(new Date(e.start_time), "yyyy-MM-dd HH:mm"),
          format(new Date(e.end_time), "yyyy-MM-dd HH:mm"),
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meetingRows), "Meetings");

      const leaveRows = [
        ["Person", "Type", "Status", "Start", "End", "Filed"],
        ...leave.map((l) => [
          nameOf(l.user_id),
          l.leave_type,
          l.status,
          l.start_date,
          l.end_date,
          format(new Date(l.created_at), "yyyy-MM-dd HH:mm"),
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leaveRows), "Leave");

      const attendanceRows = [
        ["Person", "Clock in", "Clock out", "Hours"],
        ...attendance.map((a) => {
          const hours = a.clock_out
            ? (
                (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) /
                3_600_000
              ).toFixed(2)
            : "In progress";
          return [
            nameOf(a.user_id),
            format(new Date(a.clock_in), "yyyy-MM-dd HH:mm"),
            a.clock_out ? format(new Date(a.clock_out), "yyyy-MM-dd HH:mm") : "—",
            hours,
          ];
        }),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attendanceRows), "Attendance");

      const filename = `fintreas-report-${userFilter === "all" ? "team" : personLabel}-${fromDate}-to-${toDate}.xlsx`;
      XLSX.writeFile(wb, filename.replace(/\s+/g, "_"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <FileBarChart className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Export tickets, meetings, leave, and attendance for a timeframe — everyone, or one
            person.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build a report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Person</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
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
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Generates an Excel workbook with sheets for Summary, Tickets, Meetings, Leave, and
            Attendance for the selected timeframe.
          </p>
          <Button onClick={generateReport} disabled={generating}>
            <FileDown className="mr-2 h-4 w-4" />
            {generating ? "Generating…" : "Download Excel report"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
