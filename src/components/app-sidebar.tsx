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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Leave & Holidays", url: "/leave", icon: CalendarDays },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Email", url: "/email", icon: Mail },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Tickets", url: "/tickets", icon: Ticket },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, role, isAdmin, isCeo, signOut } = useAuth();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  // Everyone clocks in except the CEO — admins are employees too here.
  const navItems = [
    items[0],
    ...(!isCeo ? [{ title: "Time Tracking", url: "/time", icon: Clock }] : []),
    ...items.slice(1),
  ];

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
