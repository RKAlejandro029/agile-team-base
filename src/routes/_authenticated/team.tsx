import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, User as UserIcon, UserPlus, Trash2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { createUserFn, deleteUserFn } from "@/functions/team.functions";
import { DEFAULT_NEW_USER_PASSWORD } from "@/config/team";
import { cn } from "@/lib/utils";
import { DAY_LABELS, DISPLAY_ORDER } from "@/lib/leave-types";

function formatSchedule(workDays: number[], startTime: string) {
  const days = DISPLAY_ORDER.filter((d) => workDays.includes(d)).map((d) => DAY_LABELS[d]);
  const dayLabel = days.length === 0 ? "No working days set" : days.join(", ");
  const time = startTime?.slice(0, 5) || "09:00";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayLabel} · ${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState(DEFAULT_NEW_USER_PASSWORD);
  const [newFullName, setNewFullName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{
    id: string;
    label: string;
    work_days: number[];
    work_start_time: string;
  } | null>(null);
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [draftTime, setDraftTime] = useState("09:00");

  const dataQ = useQuery({
    queryKey: ["team", role],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return { profiles: profiles.data ?? [], roles: roles.data ?? [] };
    },
    enabled: role === "admin",
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createUser = useMutation({
    mutationFn: async () => {
      return createUserFn({
        data: { email: newEmail, password: newPassword, fullName: newFullName || undefined },
      });
    },
    onSuccess: () => {
      toast.success("User created");
      setAddOpen(false);
      setNewEmail("");
      setNewPassword(DEFAULT_NEW_USER_PASSWORD);
      setNewFullName("");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSchedule = useMutation({
    mutationFn: async () => {
      if (!scheduleTarget) return;
      if (draftDays.length === 0) throw new Error("Pick at least one working day.");
      const { error } = await supabase
        .from("profiles")
        .update({ work_days: draftDays, work_start_time: `${draftTime}:00` })
        .eq("id", scheduleTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule updated");
      setScheduleTarget(null);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      return deleteUserFn({ data: { userId } });
    },
    onSuccess: () => {
      toast.success("User deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteTarget(null);
    },
  });

  if (role !== "admin") {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage roles across the workspace.</p>
        </div>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-1.5" />
              Add user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a new user</DialogTitle>
              <DialogDescription>
                Creates the account directly with the email and password you set below. They'll
                start as a Consultant and can change their password after signing in.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createUser.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-user-name">Full name</Label>
                <Input
                  id="new-user-name"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-email">Email</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-password">Temporary password</Label>
                <Input
                  id="new-user-password"
                  type="text"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-filled from the team default — edit here for just this user, or change{" "}
                  <code className="rounded bg-muted px-1 py-0.5">DEFAULT_NEW_USER_PASSWORD</code> in{" "}
                  <code className="rounded bg-muted px-1 py-0.5">src/config/team.ts</code> to change
                  it for everyone created after that.
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createUser.isPending}>
                  {createUser.isPending ? "Creating…" : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataQ.data?.profiles.map((p) => {
                const userRoles = dataQ
                  .data!.roles.filter((r) => r.user_id === p.id)
                  .map((r) => r.role);
                const isAdmin = userRoles.includes("admin");
                const isSelf = p.id === user?.id;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {(p.full_name || p.email).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{p.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.department || "—"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleTarget({
                            id: p.id,
                            label: p.full_name || p.email,
                            work_days: p.work_days,
                            work_start_time: p.work_start_time,
                          });
                          setDraftDays(p.work_days);
                          setDraftTime(p.work_start_time?.slice(0, 5) || "09:00");
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                      >
                        <CalendarClock className="h-3 w-3" />
                        {formatSchedule(p.work_days, p.work_start_time)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {userRoles.map((r) => (
                          <Badge
                            key={r}
                            variant={r === "admin" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {r === "admin" ? (
                              <Shield className="h-3 w-3 mr-1" />
                            ) : (
                              <UserIcon className="h-3 w-3 mr-1" />
                            )}
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSelf && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              toggleAdmin.mutate({ userId: p.id, makeAdmin: !isAdmin })
                            }
                          >
                            {isAdmin ? "Revoke admin" : "Make admin"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setDeleteTarget({ id: p.id, label: p.full_name || p.email })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!scheduleTarget} onOpenChange={(o) => !o && setScheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{scheduleTarget?.label}'s schedule</DialogTitle>
            <DialogDescription>
              Sets which days count as working days and their expected start time. This directly
              controls which dates they can select when filing leave — weekends for their schedule
              won't be selectable, whatever days you pick here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Working days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DISPLAY_ORDER.map((d) => {
                  const active = draftDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setDraftDays((prev) =>
                          prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                        )
                      }
                      className={cn(
                        "h-10 w-14 rounded-md border text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  );
                })}
              </div>
              {draftDays.length === 0 && (
                <p className="text-xs text-destructive">Pick at least one working day.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-start-time">Start time</Label>
              <Input
                id="schedule-start-time"
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={updateSchedule.isPending}
              onClick={() => updateSchedule.mutate()}
            >
              {updateSchedule.isPending ? "Saving…" : "Save schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes their account and sign-in access, along with their attendance
              history, leave requests, messages, and tickets they created. Tickets assigned to them
              stay, just unassigned. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteUser.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
