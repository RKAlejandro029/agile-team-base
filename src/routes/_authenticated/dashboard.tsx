import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AdminDashboard } from "@/components/dashboards/admin-dashboard";
import { ConsultantHome } from "@/components/dashboards/consultant-home";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { role, user } = useAuth();
  // Ensure profile row exists (for edge case where trigger raced)
  useQuery({
    queryKey: ["profile-ping", user?.id],
    queryFn: async () => {
      if (!user) return null;
      await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      return true;
    },
    enabled: !!user,
  });

  if (!role) {
    return (
      <div className="p-8">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  return role === "admin" ? <AdminDashboard /> : <ConsultantHome />;
}
