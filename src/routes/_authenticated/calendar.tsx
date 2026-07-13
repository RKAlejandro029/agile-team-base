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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { format, isSameDay, startOfWeek, addDays } from "date-fns";
import { toast } from "sonner";

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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const eventsQ = useQuery({
    queryKey: ["events", role, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("calendar_events").select("*").order("start_time");
      return data ?? [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("calendar_events").insert({
        title, description, start_time: start, end_time: end, created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meeting created");
      qc.invalidateQueries({ queryKey: ["events"] });
      setOpen(false); setTitle(""); setDescription(""); setStart(""); setEnd("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>Prev</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New meeting</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New meeting</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
                <div className="space-y-2"><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Start</Label><Input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div className="space-y-2"><Label>End</Label><Input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Week of {format(weekStart, "MMM d, yyyy")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 min-h-[400px]">
            {days.map((day) => {
              const dayEvents = (eventsQ.data ?? []).filter((e) => isSameDay(new Date(e.start_time), day));
              const today = isSameDay(day, new Date());
              return (
                <div key={day.toISOString()} className="border rounded-md overflow-hidden flex flex-col">
                  <div className={`p-2 border-b text-center ${today ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
                    <p className="text-xs font-medium">{format(day, "EEE")}</p>
                    <p className="text-lg font-semibold">{format(day, "d")}</p>
                  </div>
                  <div className="p-1 flex-1 space-y-1">
                    {dayEvents.map((e) => (
                      <div key={e.id} className="p-1.5 rounded bg-info/10 border-l-2 border-info text-xs">
                        <p className="font-medium truncate">{e.title}</p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(e.start_time), "h:mm a")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarIcon className="h-4 w-4" />Upcoming</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {(eventsQ.data ?? []).filter((e) => new Date(e.end_time) >= new Date()).slice(0, 8).map((e) => (
              <div key={e.id} className="py-3 flex items-center gap-4">
                <div className="text-center min-w-[60px]">
                  <p className="text-xs uppercase text-muted-foreground">{format(new Date(e.start_time), "MMM")}</p>
                  <p className="text-lg font-semibold">{format(new Date(e.start_time), "d")}</p>
                </div>
                <div className="flex-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(e.start_time), "EEEE h:mm a")} – {format(new Date(e.end_time), "h:mm a")}</p>
                  {e.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                </div>
              </div>
            ))}
            {eventsQ.data?.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No meetings yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
