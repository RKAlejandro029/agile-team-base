import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen w-full bg-background">
        {/* Sidebar skeleton */}
        <div className="hidden w-64 shrink-0 flex-col gap-1 bg-sidebar p-3 sm:flex">
          <div className="mb-4 flex items-center gap-2 px-2 py-2">
            <div className="h-8 w-8 animate-pulse rounded-md bg-sidebar-accent" />
            <div className="space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-sidebar-accent" />
              <div className="h-2 w-14 animate-pulse rounded bg-sidebar-accent/70" />
            </div>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-sidebar-accent/40" />
          ))}
        </div>

        {/* Content skeleton */}
        <div className="flex-1">
          <div className="h-14 border-b bg-card" />
          <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-2 border-b pb-6">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-8 w-56 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-20 animate-pulse rounded-md border bg-muted/50" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 bg-background p-4">
                  <div className="h-2 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-10 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 border-b bg-card px-4 sticky top-0 z-10">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
