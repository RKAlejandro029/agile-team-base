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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState, useEffect } from "react";
import { format, isSameDay } from "date-fns";
import { toast } from "sonner";
import {
  Check,
  X,
  Plus,
  AlertTriangle,
  FileWarning,
  CalendarDays as CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { leaveTypeLabels, DAY_LABELS, DISPLAY_ORDER, type LeaveType } from "@/lib/leave-types";

// Leave types requiring 5 working days advance notice, per the Leave Benefits
// Policy ("except in cases of emergency or unforeseen circumstances").
const ADVANCE_NOTICE_TYPES: LeaveType[] = ["vacation", "birthday", "lieu"];
const ADVANCE_NOTICE_DAYS = 5;
// Sick leave over this many days requires a medical certificate, per the
// Disciplinary Action Policy.
const MEDICAL_CERT_THRESHOLD_DAYS = 3;
// Statutory, qualifying-event leave — governed by their own laws (RA 11210,
// RA 8187, RA 8972), not the standard advance-notice/medical-cert rules above.
const STATUTORY_TYPES: LeaveType[] = ["maternity", "paternity", "solo_parent"];

// 'personal' is a legacy enum value kept only for old records — not offered
// when filing new requests, since the Handbook has no separate Personal Leave.
const FILEABLE_TYPES: LeaveType[] = [
  "vacation",
  "sick",
  "birthday",
  "lieu",
  "maternity",
  "paternity",
  "solo_parent",
];

const leaveTypeHints: Partial<Record<LeaveType, string>> = {
  vacation:
    "15 days/year. 10 must be scheduled by January (single block or staggered); the remaining 5 are SIL, usable anytime.",
  sick: "15 days/year. Notify your head ASAP; a medical certificate is required past 3 consecutive days.",
  birthday:
    "1 day/year, filed at the start of the year with your Vacation Leave. Must fall on or near your birthday.",
  lieu: "Compensatory leave, used at your manager's discretion.",
  maternity:
    "Up to 105 days paid (RA 11210). Requires supporting documents — HR will confirm your exact entitlement.",
  paternity: "7 days paid for married male employees (RA 8187). Requires supporting documents.",
  solo_parent:
    "7 working days/year for qualified solo parents (RA 8972). Requires a Solo Parent ID on file.",
  personal: "Legacy leave type — prefer Vacation (SIL) where possible.",
};

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri fallback

// Counts days that fall on one of workDays (0=Sun..6=Sat) — matches how leave
// entitlements are actually consumed against a consultant's own schedule,
// which admins can customize away from the standard Mon-Fri week.
function weekdaysBetweenInclusive(start: Date, end: Date, workDays: number[] = DEFAULT_WORK_DAYS) {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    if (workDays.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function weekdaysNotice(from: Date, to: Date, workDays: number[] = DEFAULT_WORK_DAYS) {
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    if (workDays.includes(cur.getDay())) count++;
  }
  return count;
}

export const Route = createFileRoute("/_authenticated/leave")({
  component: LeavePage,
});

function LeavePage() {
  const { user, role, isAdmin, isCeo } = useAuth();
  const qc = useQueryClient();

  // Live updates: a new filing or an approve/reject shows up immediately for
  // anyone with this page open — admin sees new requests land without
  // refreshing, and a consultant sees their own get approved in real time.
  useEffect(() => {
    const channel = supabase
      .channel("leave-requests-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["leave-requests"] });
        qc.invalidateQueries({ queryKey: ["leave-balances"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
  const [open, setOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("vacation");
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [medCertProvided, setMedCertProvided] = useState(false);
  const [isBulkSchedule, setIsBulkSchedule] = useState(() => new Date().getMonth() === 0);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  const requestsQ = useQuery({
    queryKey: ["leave-requests", role, user?.id],
    queryFn: async () => {
      let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
      if (!isAdmin) q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      // profiles isn't embedded via FK here because leave_requests.user_id
      // references auth.users, not profiles directly — PostgREST can't
      // resolve that as an embed, so fetch profiles separately and merge.
      // work_days comes along too, so late-filing checks use each person's
      // own schedule rather than assuming Mon-Fri for everyone.
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, work_days")
        .in("id", userIds);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
    },
    enabled: !!user,
  });

  // The signed-in user's own schedule — drives which dates are selectable
  // when filing and how notice/duration are counted for them.
  const profileQ = useQuery({
    queryKey: ["my-schedule", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("work_days, work_start_time")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const myWorkDays = profileQ.data?.work_days ?? DEFAULT_WORK_DAYS;
  const myOffDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !myWorkDays.includes(d));

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
  const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
  const earliestDate = sortedDates[0] ?? null;
  const noticeDays = earliestDate ? weekdaysNotice(new Date(), earliestDate, myWorkDays) : null;
  const durationDays = selectedDates.length || null;
  const needsAdvanceNotice = ADVANCE_NOTICE_TYPES.includes(leaveType);
  const isLateFiling =
    needsAdvanceNotice && noticeDays !== null && noticeDays < ADVANCE_NOTICE_DAYS && !isEmergency;
  const needsMedCert =
    leaveType === "sick" && durationDays !== null && durationDays > MEDICAL_CERT_THRESHOLD_DAYS;
  const canSubmit = selectedDates.length > 0 && !isLateFiling && (!needsMedCert || medCertProvided);

  const createRequest = useMutation({
    mutationFn: async () => {
      const rows = selectedDates.map((d) => {
        const iso = format(d, "yyyy-MM-dd");
        return {
          user_id: user!.id,
          leave_type: leaveType,
          start_date: iso,
          end_date: iso,
          reason,
          is_emergency: isEmergency,
          medical_certificate_provided: medCertProvided,
          is_bulk_schedule: leaveType === "vacation" ? isBulkSchedule : false,
        };
      });
      const { error } = await supabase.from("leave_requests").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        selectedDates.length > 1
          ? `${selectedDates.length} leave days submitted`
          : "Leave request submitted",
      );
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      setOpen(false);
      setReason("");
      setSelectedDates([]);
      setIsEmergency(false);
      setMedCertProvided(false);
      setIsBulkSchedule(new Date().getMonth() === 0);
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
        const [{ data: balance }, { data: profile }] = await Promise.all([
          supabase
            .from("leave_balances")
            .select("id, used_days")
            .eq("user_id", request.user_id)
            .eq("leave_type", request.leave_type)
            .maybeSingle(),
          supabase.from("profiles").select("work_days").eq("id", request.user_id).maybeSingle(),
        ]);
        if (balance) {
          const days = weekdaysBetweenInclusive(
            new Date(request.start_date),
            new Date(request.end_date),
            profile?.work_days ?? DEFAULT_WORK_DAYS,
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
            {role === "ceo"
              ? "Approve time off and manage the company calendar."
              : role === "admin"
                ? "Approve time off, and request your own."
                : "Request time off and see your balance."}
          </p>
          {!isCeo && (
            <p className="mt-1 text-xs text-muted-foreground">
              Your schedule:{" "}
              {DISPLAY_ORDER.filter((d) => myWorkDays.includes(d))
                .map((d) => DAY_LABELS[d])
                .join(", ")}
              {profileQ.data?.work_start_time &&
                ` · starts ${(() => {
                  const [h, m] = profileQ.data.work_start_time.slice(0, 5).split(":").map(Number);
                  const period = h >= 12 ? "PM" : "AM";
                  const h12 = h % 12 === 0 ? 12 : h % 12;
                  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
                })()}`}
              {" — "}
              <span className="italic">contact an admin to change it</span>
            </p>
          )}
        </div>
        {!isCeo && (
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) {
                setSelectedDates([]);
                setIsEmergency(false);
                setMedCertProvided(false);
                setIsBulkSchedule(new Date().getMonth() === 0);
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
                  <Select
                    value={leaveType}
                    onValueChange={(v) => {
                      setLeaveType(v as LeaveType);
                      setIsEmergency(false);
                      setMedCertProvided(false);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILEABLE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {leaveTypeLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {leaveTypeHints[leaveType] && (
                    <p className="text-xs text-muted-foreground">{leaveTypeHints[leaveType]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Dates</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDates.length === 0
                          ? "Select one or more days"
                          : `${selectedDates.length} day${selectedDates.length > 1 ? "s" : ""} selected`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="multiple"
                        selected={selectedDates}
                        onSelect={(dates) => setSelectedDates(dates ?? [])}
                        disabled={[{ dayOfWeek: myOffDays }, { before: new Date() }]}
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Pick any combination of working days — they don't need to be consecutive. Your
                    working days are{" "}
                    {DISPLAY_ORDER.filter((d) => myWorkDays.includes(d))
                      .map((d) => DAY_LABELS[d])
                      .join(", ")}
                    {myOffDays.length > 0 &&
                      ` — ${myOffDays.map((d) => DAY_LABELS[d]).join("/")} aren't selectable`}
                    .
                  </p>
                  {sortedDates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sortedDates.map((d) => (
                        <button
                          key={d.toISOString()}
                          type="button"
                          onClick={() =>
                            setSelectedDates((prev) => prev.filter((x) => !isSameDay(x, d)))
                          }
                          className="flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          {format(d, "EEE, MMM d")}
                          <X className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {leaveType === "vacation" && (
                  <div className="space-y-2">
                    <Label>Which bucket does this count against?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBulkSchedule(true)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                          isBulkSchedule ? "border-primary bg-primary/5" : "text-muted-foreground",
                        )}
                      >
                        <span className="block font-medium text-foreground">Annual schedule</span>
                        Part of your 10 pre-planned days
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsBulkSchedule(false)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                          !isBulkSchedule ? "border-primary bg-primary/5" : "text-muted-foreground",
                        )}
                      >
                        <span className="block font-medium text-foreground">SIL</span>
                        One of your 5 flexible days
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>
                    {STATUTORY_TYPES.includes(leaveType)
                      ? "Supporting document reference"
                      : "Reason"}
                  </Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      STATUTORY_TYPES.includes(leaveType)
                        ? "e.g. medical certificate number, birth certificate reference, Solo Parent ID number"
                        : "Optional"
                    }
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
                    Needs {ADVANCE_NOTICE_DAYS} working days' notice.
                    {noticeDays !== null &&
                      ` You're filing with ${noticeDays} working day${noticeDays === 1 ? "" : "s"} notice.`}
                    <label className="mt-2 flex items-center gap-2 font-normal text-foreground">
                      <Checkbox
                        checked={isEmergency}
                        onCheckedChange={(c) => setIsEmergency(!!c)}
                      />
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
                  {selectedDates.length === 0
                    ? "Select at least one date"
                    : isLateFiling
                      ? "Check the emergency box to submit"
                      : `Submit ${selectedDates.length > 1 ? `${selectedDates.length} days` : ""}`.trim()}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isCeo && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {balancesQ.data
            ?.filter((b) => b.leave_type !== "personal")
            .map((b) => {
              const remaining = Number(b.total_days) - Number(b.used_days);
              const vacationUsage =
                b.leave_type === "vacation"
                  ? (requestsQ.data ?? []).filter(
                      (r) =>
                        r.leave_type === "vacation" &&
                        r.user_id === user?.id &&
                        (r.status === "approved" || r.status === "pending"),
                    )
                  : null;
              const bulkUsed = vacationUsage
                ?.filter((r) => r.is_bulk_schedule)
                .reduce(
                  (sum, r) =>
                    sum +
                    weekdaysBetweenInclusive(
                      new Date(r.start_date),
                      new Date(r.end_date),
                      myWorkDays,
                    ),
                  0,
                );
              const silUsed = vacationUsage
                ?.filter((r) => !r.is_bulk_schedule)
                .reduce(
                  (sum, r) =>
                    sum +
                    weekdaysBetweenInclusive(
                      new Date(r.start_date),
                      new Date(r.end_date),
                      myWorkDays,
                    ),
                  0,
                );
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
                    {b.leave_type === "vacation" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {bulkUsed ?? 0}/10 scheduled · {silUsed ?? 0}/5 SIL used (filed or pending)
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="holidays">Company holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAdmin ? "All requests" : "Your requests"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && <TableHead>Consultant</TableHead>}
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestsQ.data?.map((r) => {
                      const p = (
                        r as unknown as {
                          profiles: {
                            full_name: string;
                            email: string;
                            work_days: number[];
                          } | null;
                        }
                      ).profiles;
                      const rWorkDays = p?.work_days ?? DEFAULT_WORK_DAYS;

                      const rNoticeDays = weekdaysNotice(
                        new Date(r.created_at),
                        new Date(r.start_date),
                        rWorkDays,
                      );
                      const rDurationDays = weekdaysBetweenInclusive(
                        new Date(r.start_date),
                        new Date(r.end_date),
                        rWorkDays,
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
                          {isAdmin && (
                            <TableCell className="font-medium">
                              {p?.full_name || p?.email}
                            </TableCell>
                          )}
                          <TableCell>
                            {leaveTypeLabels[r.leave_type]}
                            {r.leave_type === "vacation" && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                ({r.is_bulk_schedule ? "Annual" : "SIL"})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.start_date === r.end_date
                              ? format(new Date(r.start_date), "MMM d, yyyy")
                              : `${format(new Date(r.start_date), "MMM d")} – ${format(new Date(r.end_date), "MMM d, yyyy")}`}
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
                              {isAdmin && r.status === "pending" && rLateFiling && (
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
                              {isAdmin && r.status === "pending" && rMissingCert && (
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
                          {isAdmin && (
                            <TableCell className="text-right">
                              {r.status === "pending" &&
                                (r.user_id === user?.id ? (
                                  <span className="text-xs italic text-muted-foreground">
                                    Needs another admin
                                  </span>
                                ) : (
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
                                ))}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {requestsQ.data?.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={isAdmin ? 6 : 4}
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
              {isAdmin && (
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
