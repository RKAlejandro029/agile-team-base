import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leave")({
  component: LeavePage,
});

function LeavePage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<"vacation" | "sick" | "personal">("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  const requestsQ = useQuery({
    queryKey: ["leave-requests", role, user?.id],
    queryFn: async () => {
      let q = supabase.from("leave_requests").select("*, profiles!leave_requests_user_id_fkey(full_name, email)").order("created_at", { ascending: false });
      if (role !== "admin") q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const balancesQ = useQuery({
    queryKey: ["leave-balances", user?.id],
    queryFn: async () => (await supabase.from("leave_balances").select("*").eq("user_id", user!.id)).data ?? [],
    enabled: !!user,
  });

  const holidaysQ = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => (await supabase.from("holidays").select("*").order("date")).data ?? [],
  });

  const createRequest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leave_requests").insert({
        user_id: user!.id, leave_type: leaveType, start_date: startDate, end_date: endDate, reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      setOpen(false); setReason(""); setStartDate(""); setEndDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("leave_requests").update({
        status, reviewed_by: user!.id, reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
    },
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("holidays").insert({ name: holidayName, date: holidayDate });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added");
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setHolidayOpen(false); setHolidayName(""); setHolidayDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leave & holidays</h1>
          <p className="text-sm text-muted-foreground">
            {role === "admin" ? "Approve time off and manage the company calendar." : "Request time off and see your balance."}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Request leave</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New leave request</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createRequest.mutate(); }}>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={leaveType} onValueChange={(v) => setLeaveType(v as typeof leaveType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacation</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Start date</Label><Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>End date</Label><Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></div>
              <Button type="submit" className="w-full" disabled={createRequest.isPending}>Submit</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {balancesQ.data?.map((b) => {
          const remaining = Number(b.total_days) - Number(b.used_days);
          return (
            <Card key={b.id}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.leave_type}</p>
                <p className="text-2xl font-semibold">{remaining}<span className="text-sm text-muted-foreground font-normal"> / {b.total_days} days</span></p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="holidays">Company holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card>
            <CardHeader><CardTitle className="text-base">{role === "admin" ? "All requests" : "Your requests"}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {role === "admin" && <TableHead>Consultant</TableHead>}
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    {role === "admin" && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsQ.data?.map((r) => {
                    const p = (r as unknown as { profiles: { full_name: string; email: string } | null }).profiles;
                    return (
                      <TableRow key={r.id}>
                        {role === "admin" && <TableCell className="font-medium">{p?.full_name || p?.email}</TableCell>}
                        <TableCell className="capitalize">{r.leave_type}</TableCell>
                        <TableCell>{format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{r.reason || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                            {r.status}
                          </Badge>
                        </TableCell>
                        {role === "admin" && (
                          <TableCell className="text-right">
                            {r.status === "pending" && (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: "approved" })}><Check className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: "rejected" })}><X className="h-3 w-3" /></Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {requestsQ.data?.length === 0 && (
                    <TableRow><TableCell colSpan={role === "admin" ? 6 : 4} className="text-center text-muted-foreground py-8">No requests.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Company holidays</CardTitle>
              {role === "admin" && (
                <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add holiday</DialogTitle></DialogHeader>
                    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addHoliday.mutate(); }}>
                      <div className="space-y-2"><Label>Name</Label><Input required value={holidayName} onChange={(e) => setHolidayName(e.target.value)} /></div>
                      <div className="space-y-2"><Label>Date</Label><Input type="date" required value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} /></div>
                      <Button type="submit" className="w-full" disabled={addHoliday.isPending}>Add</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {holidaysQ.data?.map((h) => (
                  <div key={h.id} className="flex justify-between py-2 text-sm">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-muted-foreground">{format(new Date(h.date), "EEE, MMM d, yyyy")}</span>
                  </div>
                ))}
                {holidaysQ.data?.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">No holidays set.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
