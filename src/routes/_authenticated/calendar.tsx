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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  PlaneTakeoff,
} from "lucide-react";
import {
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  eachDayOfInterval,
} from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { leaveTypeLabels } from "@/lib/leave-types";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [dayDetail, setDayDetail] = useState<Date | null>(null);

  const gridStart = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const rangeKey = `${format(gridStart, "yyyy-MM-dd")}_${format(gridEnd, "yyyy-MM-dd")}`;

  const eventsQ = useQuery({
    queryKey: ["events", rangeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("start_time", gridStart.toISOString())
        .lte("start_time", gridEnd.toISOString())
        .order("start_time");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Every user gets to see who's approved to be on leave, via a security-definer
  // RPC that exposes only the safe fields (no reason, no pending/rejected rows) —
  // full request detail stays restricted to the requester and admins.
  const leaveQ = useQuery({
    queryKey: ["team-leave", rangeKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_team_leave", {
        from_date: format(gridStart, "yyyy-MM-dd"),
        to_date: format(gridEnd, "yyyy-MM-dd"),
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("calendar_events").insert({
        title,
        description,
        start_time: start,
        end_time: end,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meeting created");
      qc.invalidateQueries({ queryKey: ["events"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setStart("");
      setEnd("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eventsForDay = (day: Date) =>
    (eventsQ.data ?? []).filter((e) => isSameDay(new Date(e.start_time), day));
  const leaveForDay = (day: Date) =>
    (leaveQ.data ?? []).filter((l) =>
      isWithinInterval(day, { start: new Date(l.start_date), end: new Date(l.end_date) }),
    );

  // Grouped per person for the month, for the "who's out this month" list —
  // consecutive days for the same person/type collapse into one range already,
  // since that's how the leave request itself was filed.
  const monthLeave = (leaveQ.data ?? []).filter(
    (l) =>
      isWithinInterval(new Date(l.start_date), { start: gridStart, end: gridEnd }) ||
      isWithinInterval(new Date(l.end_date), { start: gridStart, end: gridEnd }) ||
      (new Date(l.start_date) <= gridStart && new Date(l.end_date) >= gridEnd),
  );

  const detailEvents = dayDetail ? eventsForDay(dayDetail) : [];
  const detailLeave = dayDetail ? leaveForDay(dayDetail) : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {role === "admin" ? "Team-wide meeting schedule." : "Your meetings and invites."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonthCursor(addMonths(monthCursor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonthCursor(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonthCursor(addMonths(monthCursor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New meeting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New meeting</DialogTitle>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input
                      type="datetime-local"
                      required
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input
                      type="datetime-local"
                      required
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{format(monthCursor, "MMMM yyyy")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                className="bg-muted/50 px-2 py-1.5 text-center font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {gridDays.map((day) => {
              const dayEvents = eventsForDay(day);
              const dayLeave = leaveForDay(day);
              const inMonth = isSameMonth(day, monthCursor);
              const today = isSameDay(day, new Date());
              const overflowCount =
                Math.max(0, dayEvents.length - 2) + Math.max(0, dayLeave.length - 1);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setDayDetail(day)}
                  className={cn(
                    "flex min-h-[100px] flex-col items-stretch gap-1 bg-background p-1.5 text-left transition-colors hover:bg-accent/40",
                    !inMonth && "bg-muted/20 text-muted-foreground/50",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono-data flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {dayLeave.slice(0, 1).map((l) => (
                      <div
                        key={`${l.user_id}-${l.start_date}`}
                        className="flex items-center gap-1 truncate rounded bg-warning/10 px-1 py-0.5 text-[10px] text-warning"
                      >
                        <PlaneTakeoff className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{l.full_name}</span>
                      </div>
                    ))}
                    {dayEvents.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className="truncate rounded border-l-2 border-info bg-info/10 px-1 py-0.5 text-[10px]"
                      >
                        {e.title}
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{overflowCount} more
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {(eventsQ.data ?? [])
                .filter((e) => new Date(e.end_time) >= new Date())
                .slice(0, 8)
                .map((e) => (
                  <div key={e.id} className="py-3 flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <p className="text-xs uppercase text-muted-foreground">
                        {format(new Date(e.start_time), "MMM")}
                      </p>
                      <p className="text-lg font-semibold">{format(new Date(e.start_time), "d")}</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.start_time), "EEEE h:mm a")} –{" "}
                        {format(new Date(e.end_time), "h:mm a")}
                      </p>
                      {e.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {e.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              {eventsQ.data?.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No meetings this month.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PlaneTakeoff className="h-4 w-4" />
              On leave in {format(monthCursor, "MMMM")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {monthLeave.map((l) => (
                <div
                  key={`${l.user_id}-${l.start_date}`}
                  className="py-2.5 flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{l.full_name}</span>
                  <span className="text-muted-foreground text-xs">
                    {leaveTypeLabels[l.leave_type]} · {format(new Date(l.start_date), "MMM d")}
                    {l.start_date !== l.end_date && ` – ${format(new Date(l.end_date), "MMM d")}`}
                  </span>
                </div>
              ))}
              {monthLeave.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No one's on approved leave this month.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!dayDetail} onOpenChange={(o) => !o && setDayDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dayDetail && format(dayDetail, "EEEE, MMMM d, yyyy")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {detailLeave.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  On leave
                </p>
                <div className="space-y-1.5">
                  {detailLeave.map((l) => (
                    <div
                      key={`${l.user_id}-${l.start_date}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <PlaneTakeoff className="h-3.5 w-3.5 text-warning" />
                      {l.full_name}
                      <span className="text-xs text-muted-foreground">
                        ({leaveTypeLabels[l.leave_type]})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Meetings
              </p>
              {detailEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meetings scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {detailEvents.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-md border-l-2 border-info bg-info/5 px-3 py-2"
                    >
                      <p className="font-medium text-sm">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.start_time), "h:mm a")} –{" "}
                        {format(new Date(e.end_time), "h:mm a")}
                      </p>
                      {e.description && (
                        <p className="text-sm text-muted-foreground mt-1">{e.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
