import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();

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
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") {
    return <div className="p-6"><p className="text-muted-foreground">Admins only.</p></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Manage roles across the workspace.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataQ.data?.profiles.map((p) => {
                const userRoles = dataQ.data!.roles.filter((r) => r.user_id === p.id).map((r) => r.role);
                const isAdmin = userRoles.includes("admin");
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8"><AvatarFallback>{(p.full_name || p.email).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                        <div>
                          <p className="font-medium">{p.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.department || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {userRoles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="capitalize">
                            {r === "admin" ? <Shield className="h-3 w-3 mr-1" /> : <UserIcon className="h-3 w-3 mr-1" />}
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.id !== user?.id && (
                        <Button size="sm" variant="outline" onClick={() => toggleAdmin.mutate({ userId: p.id, makeAdmin: !isAdmin })}>
                          {isAdmin ? "Revoke admin" : "Make admin"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
