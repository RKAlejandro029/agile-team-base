import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  MessageSquare,
  Mail,
  Calendar,
  Ticket,
  LogOut,
  Users,
  KeyRound,
  History,
  FileBarChart,
  Sun,
  Moon,
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const items = [
  { key: "dashboard", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "time", title: "Time Tracking", url: "/time", icon: Clock },
  { key: "leave", title: "Leave & Holidays", url: "/leave", icon: CalendarDays },
  { key: "messages", title: "Messages", url: "/messages", icon: MessageSquare },
  { key: "email", title: "Email", url: "/email", icon: Mail },
  { key: "calendar", title: "Calendar", url: "/calendar", icon: Calendar },
  { key: "tickets", title: "Tickets", url: "/tickets", icon: Ticket },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, role, isAdmin, isCeo, allowedTabs, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  // Only the tabs this specific person has been granted (CEO customizes this
  // per-person from the Team page). Team/History/Reports below are separate —
  // those are hard role gates, not something allowedTabs can grant.
  const navItems = items.filter((item) => allowedTabs.includes(item.key));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
            <img src="/logo.png" alt="Fintreas" className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold text-sidebar-foreground">
                Fintreas
              </span>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                {role === "ceo" ? "CEO" : role === "admin" ? "Admin Console" : "Consultant"}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/team"}>
                    <Link to="/team">
                      <Users className="h-4 w-4" />
                      <span>Team</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isCeo && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/history"}>
                    <Link to="/history">
                      <History className="h-4 w-4" />
                      <span>History</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isCeo && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/reports"}>
                    <Link to="/reports">
                      <FileBarChart className="h-4 w-4" />
                      <span>Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">
                  {user?.email}
                </p>
                <p className="text-[10px] text-sidebar-foreground/60 capitalize">{role}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <ChangePasswordDialog
                trigger={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    aria-label="Change password"
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                }
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => signOut()}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
