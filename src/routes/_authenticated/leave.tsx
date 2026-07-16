import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X, Plus, AlertTriangle, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { leaveTypeLabels, type LeaveType } from "@/lib/leave-types";

// Leave types requiring 5 working days advance notice, per the Leave Benefits
// Policy ("except in cases of emergency or unforeseen circumstances").
const ADVANCE_NOTICE_TYPES: LeaveType[] = ["vacation", "birthday", "lieu"];
const ADVANCE_NOTICE_DAYS = 5;
// Sick leave over this many days requires a medical certificate, per the
// Disciplinary Action Policy.
const MEDICAL_CERT_THRESHOLD_DAYS = 3;

// Weekday-only counts — matches how leave entitlements are actually consumed.
function weekdaysBetweenInclusive(start: Date, end: Date) {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function weekdaysNotice(from: Date, to: Date) {
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export const Route = createFileRoute("/_authenticated/leave")({
  component: LeavePage,
});

function LeavePage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [medCertProvided, setMedCertProvided] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  const requestsQ = useQuery({
    queryKey: ["leave-requests", role, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (role !== "admin") q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const balancesQ = useQuery({
    queryKey: ["leave-balances", user?.id],
    queryFn: async () =>
      (await supabase.from("leave_balances").select("*").eq("user_id", user!.id)).data ?? [],
    enabled: !!user,
  });

  const holidaysQ = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => (await supabase.from("holidays").select("*").order("date")).data ?? [],
  });

  // Live validation for the filing form, so the employee sees the policy rule
  // before submitting instead of finding out from a rejection later.
  const noticeDays = startDate ? weekdaysNotice(new Date(), new Date(startDate)) : null;
  const durationDays =
    startDate && endDate ? weekdaysBetweenInclusive(new Date(startDate), new Date(endDate)) : null;
  const needsAdvanceNotice = ADVANCE_NOTICE_TYPES.includes(leaveType);
  const isLateFiling =
    needsAdvanceNotice && noticeDays !== null && noticeDays < ADVANCE_NOTICE_DAYS && !isEmergency;
  const needsMedCert =
    leaveType === "sick" && durationDays !== null && durationDays > MEDICAL_CERT_THRESHOLD_DAYS;
  const canSubmit = !isLateFiling && (!needsMedCert || medCertProvided);

  const createRequest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leave_requests").insert({
        user_id: user!.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason,
        is_emergency: isEmergency,
        medical_certificate_provided: medCertProvided,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      setOpen(false);
      setReason("");
      setStartDate("");
      setEndDate("");
      setIsEmergency(false);
      setMedCertProvided(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: async ({
      request,
      status,
    }: {
      request: {
        id: string;
        user_id: string;
        leave_type: LeaveType;
        start_date: string;
        end_date: string;
      };
      status: "approved" | "rejected";
    }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
        .eq("id", request.id);
      if (error) throw error;

      // Approving deducts the requested weekdays from the matching balance, if
      // one exists on file. Conditional-entitlement types (maternity/paternity/
      // solo parent) often won't have a pre-existing balance row — that's fine,
      // it's skipped silently rather than erroring the whole approval.
      if (status === "approved") {
        const { data: balance } = await supabase
          .from("leave_balances")
          .select("id, used_days")
          .eq("user_id", request.user_id)
          .eq("leave_type", request.leave_type)
          .maybeSingle();
        if (balance) {
          const days = weekdaysBetweenInclusive(
            new Date(request.start_date),
            new Date(request.end_date),
          );
          const { error: balErr } = await supabase
            .from("leave_balances")
            .update({ used_days: Number(balance.used_days) + days })
            .eq("id", balance.id);
          if (balErr) throw balErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("holidays")
        .insert({ name: holidayName, date: holidayDate });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added");
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setHolidayOpen(false);
      setHolidayName("");
      setHolidayDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leave & holidays</h1>
          <p className="text-sm text-muted-foreground">
            {role === "admin"
              ? "Approve time off and manage the company calendar."
              : "Request time off and see your balance."}
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setIsEmergency(false);
              setMedCertProvided(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Request leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New leave request</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) createRequest.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(leaveTypeLabels) as LeaveType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {leaveTypeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {needsAdvanceNotice && (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    isLateFiling
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {leaveTypeLabels[leaveType]} leave needs {ADVANCE_NOTICE_DAYS} working days'
                  notice.
                  {noticeDays !== null &&
                    ` You're filing with ${noticeDays} working day${noticeDays === 1 ? "" : "s"} notice.`}
                  <label className="mt-2 flex items-center gap-2 font-normal text-foreground">
                    <Checkbox checked={isEmergency} onCheckedChange={(c) => setIsEmergency(!!c)} />
                    This is an emergency / unforeseen circumstance
                  </label>
                </div>
              )}

              {leaveType === "sick" &&
                durationDays !== null &&
                durationDays > MEDICAL_CERT_THRESHOLD_DAYS && (
                  <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-foreground">
                    Sick leave over {MEDICAL_CERT_THRESHOLD_DAYS} days requires a medical
                    certificate from a licensed physician.
                    <label className="mt-2 flex items-center gap-2 font-normal">
                      <Checkbox
                        checked={medCertProvided}
                        onCheckedChange={(c) => setMedCertProvided(!!c)}
                      />
                      I have (or will submit) a medical certificate for this absence
                    </label>
                  </div>
                )}

              <Button
                type="submit"
                className="w-full"
                disabled={createRequest.isPending || !canSubmit}
              >
                {isLateFiling ? "Check the emergency box to submit" : "Submit"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {balancesQ.data?.map((b) => {
          const remaining = Number(b.total_days) - Number(b.used_days);
          return (
            <Card key={b.id}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {leaveTypeLabels[b.leave_type]}
                </p>
                <p className="text-2xl font-semibold">
                  {remaining}
                  <span className="text-sm text-muted-foreground font-normal">
                    {" "}
                    / {b.total_days} days
                  </span>
                </p>
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
            <CardHeader>
              <CardTitle className="text-base">
                {role === "admin" ? "All requests" : "Your requests"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
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
                      const p = (
                        r as unknown as { profiles: { full_name: string; email: string } | null }
                      ).profiles;

                      const rNoticeDays = weekdaysNotice(
                        new Date(r.created_at),
                        new Date(r.start_date),
                      );
                      const rDurationDays = weekdaysBetweenInclusive(
                        new Date(r.start_date),
                        new Date(r.end_date),
                      );
                      const rLateFiling =
                        ADVANCE_NOTICE_TYPES.includes(r.leave_type) &&
                        rNoticeDays < ADVANCE_NOTICE_DAYS &&
                        !r.is_emergency;
                      const rMissingCert =
                        r.leave_type === "sick" &&
                        rDurationDays > MEDICAL_CERT_THRESHOLD_DAYS &&
                        !r.medical_certificate_provided;

                      return (
                        <TableRow key={r.id}>
                          {role === "admin" && (
                            <TableCell className="font-medium">
                              {p?.full_name || p?.email}
                            </TableCell>
                          )}
                          <TableCell>{leaveTypeLabels[r.leave_type]}</TableCell>
                          <TableCell>
                            {format(new Date(r.start_date), "MMM d")} –{" "}
                            {format(new Date(r.end_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                            {r.reason || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  r.status === "approved"
                                    ? "default"
                                    : r.status === "rejected"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="capitalize"
                              >
                                {r.status}
                              </Badge>
                              {role === "admin" && r.status === "pending" && rLateFiling && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    Filed with less than {ADVANCE_NOTICE_DAYS} working days' notice
                                    and not marked as an emergency — a Late Filing violation per the
                                    Disciplinary Action Policy.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {role === "admin" && r.status === "pending" && rMissingCert && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <FileWarning className="h-3.5 w-3.5 text-warning" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    Over {MEDICAL_CERT_THRESHOLD_DAYS} days with no medical
                                    certificate on file — follow up before approving, per policy.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          {role === "admin" && (
                            <TableCell className="text-right">
                              {r.status === "pending" && (
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      review.mutate({ request: r, status: "approved" })
                                    }
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      review.mutate({ request: r, status: "rejected" })
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {requestsQ.data?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={role === "admin" ? 6 : 4}
                          className="text-center text-muted-foreground py-8"
                        >
                          No requests.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Company holidays</CardTitle>
              {role === "admin" && (
                <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add holiday</DialogTitle>
                    </DialogHeader>
                    <form
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        addHoliday.mutate();
                      }}
                    >
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          required
                          value={holidayName}
                          onChange={(e) => setHolidayName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input
                          type="date"
                          required
                          value={holidayDate}
                          onChange={(e) => setHolidayDate(e.target.value)}
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={addHoliday.isPending}>
                        Add
                      </Button>
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
                    <span className="text-muted-foreground">
                      {format(new Date(h.date), "EEE, MMM d, yyyy")}
                    </span>
                  </div>
                ))}
                {holidaysQ.data?.length === 0 && (
                  <p className="text-center text-muted-foreground py-6 text-sm">No holidays set.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
